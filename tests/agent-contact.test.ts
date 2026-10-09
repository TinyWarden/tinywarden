import { randomUUID } from "node:crypto";
import { mkdtemp, chmod, readdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { notificationFixture, url } from "./p4b.fixture";
import { heartbeat } from "../server/fleet/heartbeat";
import { contactSummary } from "../server/fleet/contact";
import { detailHost } from "../server/fleet/inventory";
import { importSkillDirectory } from "../server/skills/catalog/package-install";
import { setPackageEnabled } from "../server/skills/catalog/package-controls";
import { fetchPackageAssignments } from "../server/skills/assignments/packages";
import { acceptPackageRun } from "../server/skills/results/package-runs";
import { readPackageResults } from "../server/skills/results/package-projection";
import { requestManualRun } from "../server/skills/manual/operator";
import { startManualRun } from "../server/skills/manual/agent";
import { manualCapability } from "../server/skills/manual/lifecycle";

async function clean(root: string) {
  await chmod(root, 0o700);
  for (const d of await readdir(root, { withFileTypes: true })) if (d.isDirectory()) await clean(path.join(root, d.name));
  await rm(root, { recursive: true, force: true });
}
describe.skipIf(!url)("CR1 accepted agent contact", () => {
  let f: Awaited<ReturnType<typeof notificationFixture>>, store: string, id: string, initial: Date;
  beforeEach(async () => {
    f = await notificationFixture(); initial = f.clock();
    store = await mkdtemp(path.join(os.tmpdir(), "tw-contact-"));
    const installed = await importSkillDirectory(f.db, f.session, { request_id: randomUUID(),
      directory: path.join(process.cwd(), "tests/skills/packages/fixtures/memory-pressure") }, f.clock, store);
    id = installed.installation_id;
    const p = await f.db.selectFrom("skill_packages").selectAll().where("content_sha256", "=", installed.content_sha256).executeTakeFirstOrThrow();
    await setPackageEnabled(f.db, f.session, id, { request_id: randomUUID(), expected_enablement_version: "1",
      content_sha256: installed.content_sha256, enabled: true, grants: p.metadata.manifest.capabilities }, f.clock);
  });
  afterEach(async () => { await f?.db.destroy(); if (store) await clean(store); });
  const move = (seconds: number) => f.setTime(new Date(+initial + seconds * 1000));
  const credential = () => f.db.selectFrom("agent_credentials").selectAll().where("agent_id", "=", f.agentId).executeTakeFirstOrThrow();
  const summary = () => f.db.transaction().execute(trx => contactSummary(trx, f.hostId, f.clock));
  const delivery = () => fetchPackageAssignments(f.db, f.agentCredential, true, f.clock, manualCapability);
  it("counts assignment traffic after heartbeat expiry and keeps all contact views current", async () => {
    move(181); expect((await summary()).state).toBe("offline");
    await delivery(); const saved = await credential();
    expect(saved.accepted_at).toEqual(initial); expect(saved.last_contact_at).toEqual(f.clock());
    expect((await summary()).state).toBe("healthy");
    expect((await detailHost(f.db, f.session, f.hostId, f.clock)).host).toMatchObject({ contact_state: "current", last_contact_at: f.clock().toISOString() });
    expect((await readPackageResults(f.db, f.session, f.hostId, f.clock)).skills[0]!.reason).toBe("awaiting_reading");
    move(360); expect((await summary()).state).toBe("healthy");
    move(361); expect((await summary()).state).toBe("offline");
  });
  it("refreshes contact on exact heartbeat replay while preserving receipt and rejecting conflicts", async () => {
    const input = { sequence: 2, sentAt: initial, agentVersion: "0.0.6" };
    const first = await heartbeat(f.db, f.agentCredential, input, f.clock);
    move(181); const replay = await heartbeat(f.db, f.agentCredential, input, f.clock);
    expect(replay).toEqual({ ...first, duplicate: true });
    expect((await credential()).accepted_at).toEqual(initial);
    expect((await summary()).state).toBe("healthy");
    const contact = (await credential()).last_contact_at;
    move(182); await expect(heartbeat(f.db, f.agentCredential, { ...input, agentVersion: "different" }, f.clock)).rejects.toMatchObject({ code: "sequence_conflict" });
    expect((await credential()).last_contact_at).toEqual(contact);
    move(180); await heartbeat(f.db, f.agentCredential, input, f.clock);
    expect((await credential()).last_contact_at).toEqual(contact);
  });
  it("counts accepted result/replay only and retains reading expiry independently", async () => {
    const assigned = (await delivery()).assignments[0]!;
    const run = { run_id: randomUUID(), run_sequence: 1, assignment_id: assigned.assignment_id!,
      started_at: initial.toISOString(), finished_at: initial.toISOString(), outcome: "execution_failed" as const, observation: null };
    const first = await acceptPackageRun(f.db, f.agentCredential, run, f.clock, store);
    move(181); const replay = await acceptPackageRun(f.db, f.agentCredential, run, f.clock, store);
    expect(replay).toEqual(first); expect((await summary()).state).toBe("healthy");
    expect(await f.db.selectFrom("skill_observations").select("id").execute()).toHaveLength(1);
    const before = (await credential()).last_contact_at;
    move(182); await expect(acceptPackageRun(f.db, f.agentCredential, { ...run, run_id: randomUUID(), run_sequence: 2,
      outcome: "observed", observation: {} }, f.clock, store)).rejects.toMatchObject({ code: "invalid_request" });
    expect((await credential()).last_contact_at).toEqual(before);
    // The failed reading is never relabeled healthy by current contact.
    expect((await readPackageResults(f.db, f.session, f.hostId, f.clock)).skills[0]!.reason).toBe("execution_failed");
    const reading = await f.db.selectFrom("skill_observations").select("evidence_expires_at").executeTakeFirstOrThrow();
    f.setTime(reading.evidence_expires_at); await delivery();
    expect((await summary()).state).toBe("healthy");
    expect((await readPackageResults(f.db, f.session, f.hostId, f.clock)).skills[0]!.reason).toBe("reading_expired");
  });
  it("allows a valid queued start to prove contact and rolls back a rejected start", async () => {
    const assigned = (await delivery()).assignments[0]!;
    const feedback = (await readPackageResults(f.db, f.session, f.hostId, f.clock)).skills[0]!.manual_run;
    const request = await requestManualRun(f.db, f.session, f.hostId, id, { request_id: randomUUID(), expected_context: feedback.expected_context! }, f.clock);
    const claim = { manual_request_id: request.id, assignment_id: assigned.assignment_id!, run_id: randomUUID(), run_sequence: 1 };
    move(181); await startManualRun(f.db, f.agentCredential, claim, f.clock);
    expect((await summary()).state).toBe("healthy"); const before = (await credential()).last_contact_at;
    move(182); await expect(startManualRun(f.db, f.agentCredential, { ...claim, run_id: randomUUID() }, f.clock)).rejects.toMatchObject({ code: "manual_request_invalid" });
    expect((await credential()).last_contact_at).toEqual(before);
  });
  it("counts polling before the first heartbeat without inventing a heartbeat receipt", async () => {
    await f.db.updateTable("agent_credentials").set({ last_sequence: 0, last_fingerprint: null,
      accepted_at: null, sent_at: null, agent_version: null, last_contact_at: null }).where("agent_id", "=", f.agentId).execute();
    await delivery(); const saved = await credential();
    expect(saved.last_sequence).toBe("0"); expect(saved.accepted_at).toBeNull();
    expect((await summary()).state).toBe("healthy");
  });
  it("does not refresh contact when a recovery latch commits a rejected legacy upload", async () => {
    const before = (await credential()).last_contact_at; move(1);
    const response = await f.diskPost({ ...f.disk(1), assignment_id: randomUUID() });
    expect(response.status).toBe(409);
    expect(await f.db.selectFrom("disk_recovery_latches").select("agent_id").execute()).toHaveLength(1);
    expect((await credential()).last_contact_at).toEqual(before);
  });
  it("cannot revive revoked authority or refresh contact through rejected authentication", async () => {
    move(181); const before = (await credential()).last_contact_at;
    const bad = f.agentCredential.slice(0, -1) + (f.agentCredential.endsWith("a") ? "b" : "a");
    await expect(fetchPackageAssignments(f.db, bad, true, f.clock)).rejects.toMatchObject({ code: "unauthorized" });
    expect((await credential()).last_contact_at).toEqual(before);
    await f.db.updateTable("agents").set({ revoked_at: f.clock() }).where("id", "=", f.agentId).execute();
    await expect(delivery()).rejects.toMatchObject({ code: "unauthorized" });
    expect((await summary()).eligible).toBe(false); expect((await credential()).last_contact_at).toEqual(before);
  });
});
