import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newCredential } from "../server/validation";
import { updateBaselineDefinition } from "../server/checks/baseline-policy";
import { fixture, known, sample, url, wire } from "./p3c.fixture";

describe.skipIf(!url)("C01/C03 scope, concurrency and committed recovery", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => { f = await fixture(); });
  afterEach(async () => { if (f) await f.db.destroy(); });

  it("authenticates before known hints and wrong scopes cannot damage another host", async () => {
    const d = (await wire(await f.fetch())).assignments;
    expect((await f.fetch(known(d), undefined, "invalid")).status).toBe(401);
    expect(await f.db.selectFrom("baseline_recovery_latches").selectAll().where("agent_id", "=", f.agentId).execute()).toHaveLength(0);
    const other = await fixture();
    try {
      const r = sample("package-updates", d[0]!, f.clock(), 1);
      expect((await other.run(r)).status).toBe(409);
      expect(await other.db.selectFrom("baseline_recovery_latches").selectAll().where("agent_id", "=", other.agentId).execute()).toHaveLength(0);
      expect((await f.fetch(known(d))).status).toBe(200);
    } finally { await other.db.destroy(); }
  });
  it("commits a missing known revision latch before 409 and rejects empty-cache bypass", async () => {
    const d = (await wire(await f.fetch())).assignments;
    await f.heartbeat(1);
    expect((await f.run(sample("fstrim-status", d[2]!, f.clock(), 1))).status).toBe(200);
    expect((await wire(await f.health())).checks[2]?.state).toBe("healthy");
    const hints = known(d);
    hints[0]!.known = { id: randomUUID(), revision: d[0]!.revision + 10, digest: "0".repeat(64) };
    expect((await f.fetch(hints)).status).toBe(409);
    expect((await f.db.selectFrom("baseline_recovery_latches").selectAll().where("agent_id", "=", f.agentId).executeTakeFirst())?.reason).toBe("assignment_revision_regressed");
    expect((await f.fetch()).status).toBe(409);
    expect((await wire(await f.health())).checks.every((c) => c.reason === "baseline_recovery_required")).toBe(true);
  });
  it("equal revision identity mismatch latches without publishing changed candidates", async () => {
    const d = (await wire(await f.fetch())).assignments;
    const ids = await f.db.selectFrom("baseline_snapshots").select("id").where("host_id", "=", f.hostId).execute();
    await f.db.updateTable("hosts").set({ architecture: "arm64" }).where("id", "=", f.hostId).execute();
    const hints = known(d); hints[2]!.known.digest = "0".repeat(64);
    expect((await f.fetch(hints)).status).toBe(409);
    expect(await f.db.selectFrom("baseline_snapshots").select("id").where("host_id", "=", f.hostId).execute()).toEqual(ids);
    expect((await f.db.selectFrom("baseline_recovery_latches").select("reason").where("agent_id", "=", f.agentId).executeTakeFirst())?.reason).toBe("assignment_identity_conflict");
  });
  it("missing result snapshot latches, and only new authority plus new evidence recovers", async () => {
    const old = (await wire(await f.fetch())).assignments;
    const r = sample("fstrim-status", old[2]!, f.clock(), 1);
    expect((await f.run({ ...r, assignment_id: randomUUID() })).status).toBe(409);
    expect((await f.run(r)).status).toBe(200);
    expect((await wire(await f.health())).checks[2]?.reason).toBe("baseline_recovery_required");
    const next = newCredential("agent");
    await f.db.transaction().execute(async (trx) => {
      await trx.updateTable("agent_credentials").set({ revoked_at: f.clock() }).where("agent_id", "=", f.agentId).execute();
      await trx.insertInto("agent_credentials").values({ id: next.id, agent_id: f.agentId, generation: 2,
        secret_digest: next.digest, created_at: f.clock(), revoked_at: null, last_sequence: 0,
        last_fingerprint: null, accepted_at: null, sent_at: null, agent_version: null }).execute();
      await trx.updateTable("agents").set({ current_generation: 2 }).where("id", "=", f.agentId).execute();
    });
    expect((await f.run(r)).status).toBe(401);
    expect((await f.run(r, next.value)).status).toBe(409);
    const delivered = await wire(await f.fetch(undefined, undefined, next.value));
    expect(delivered.generation).toBe(2);
    expect(delivered.assignments[2]?.assignment_id).not.toBe(old[2]!.assignment_id);
    await f.db.updateTable("agent_credentials").set({ accepted_at: f.clock(), sent_at: f.clock(),
      last_sequence: 1, last_fingerprint: Buffer.alloc(32, 1), agent_version: "0.0.1" }).where("id", "=", next.id).execute();
    expect((await wire(await f.health())).checks[2]?.reason).toBe("no_observation");
    expect((await f.run(sample("fstrim-status", delivered.assignments[2]!, f.clock(), 1), next.value)).status).toBe(200);
    expect((await wire(await f.health())).checks[2]?.state).toBe("healthy");
    expect((await wire(await f.health())).checks[2]?.history).toHaveLength(2);
  });
  it("rolls back source, audit and receipt together when the audit insert fails", async () => {
    const before = await wire(await f.defaults("reboot-required"));
    const id = randomUUID();
    await expect(updateBaselineDefinition(f.db, f.session, "reboot-required", { requestId: id,
      expectedRevision: before.revision, values: { interval_seconds: 400, timeout_seconds: 9, package_mode: "upgrade" } }, f.clock, "invalid-uuid"))
      .rejects.toMatchObject({ code: "22P02" });
    expect((await wire(await f.defaults("reboot-required"))).revision).toBe(before.revision);
    expect(await f.db.selectFrom("baseline_receipts").select("request_id").where("request_id", "=", id).execute()).toHaveLength(0);
  });
  it("concurrent delivery is one snapshot per source and shares sorted locks with edits", async () => {
    const responses = await Promise.all([f.fetch(), f.fetch(), f.fetch()]);
    const delivered = await Promise.all(responses.map(wire));
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(new Set(delivered.map((d) => d.assignments[0]!.assignment_id)).size).toBe(1);
    expect(await f.db.selectFrom("baseline_snapshots").select("id").where("host_id", "=", f.hostId).execute()).toHaveLength(3);
    const base = await wire(await f.defaults("reboot-required"));
    const values = { interval_seconds: base.interval_seconds, timeout_seconds: base.timeout_seconds === 10 ? 9 : 10, package_mode: "upgrade" };
    const both = await Promise.all([f.fetch(known(delivered[0]!.assignments)), f.edit("reboot-required", base.revision, values)]);
    expect(both.map((r) => r.status)).toEqual([200, 200]);
    const last = await wire(await f.defaults("reboot-required"));
    await f.edit("reboot-required", last.revision, { ...values, timeout_seconds: base.timeout_seconds });
  });
});
