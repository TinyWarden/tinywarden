import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { notificationFixture, url } from "../../p4b.fixture";
import { sample, wire } from "../baseline/fixture";
import { agentAssignments, operatorUpdateDiskDefinition } from "../../../server/http/handlers";
import { operatorSkillEnabled, operatorSkills } from "../../../server/http/skill-handlers";
import { readDashboard } from "../../../server/fleet/dashboard";
import { captureHistoryFamily } from "../../../server/history/sampling";
import { runHistory } from "../../../server/history/run";
import { baselineKeys } from "../../../server/skills/legacy/shared/types";
import { claimEvent, finishEvent } from "../../../server/notifications/dispatch";

describe.skipIf(!url)("U5 global skill control", () => {
  let f: Awaited<ReturnType<typeof notificationFixture>>;
  beforeEach(async () => { f = await notificationFixture(); });
  afterEach(async () => { await f?.db.destroy(); });
  const toggle = (key: string, expected: number, enabled: boolean, id = randomUUID()) =>
    operatorSkillEnabled(f.req(`/api/v1/operator/skills/${key}/enabled`, { schema_version: 1,
      request_id: id, expected_enablement_version: expected, enabled }, undefined, f.session), key, f.ctx);
  const fetchDisk = (capable = true) => agentAssignments(f.req("/api/v1/agent/assignments", {
    schema_version: 1, agent_version: "0.0.2", capabilities: ["disk_usage.v1", ...(capable ? ["skill-control.v1"] : [])], known_assignment: null }, f.agentCredential), f.ctx);
  const catalog = async () => (await (await operatorSkills(f.req("/api/v1/operator/skills", undefined, undefined, f.session), f.ctx)).json()).skills;

  it("preserves pinned values while Off, consumes one mutation, and separates rapid-cycle assignments", async () => {
    await f.db.insertInto("host_check_policy_revisions").values({ host_id: f.hostId, definition_key: "disk-local", version: 1, mode: "override", warning_percent: 90, critical_percent: 98, interval_seconds: 600, pinned_definition_revision: 1, created_at: f.clock() }).execute();
    await f.db.updateTable("host_check_policies").set({ current_policy_version: 1 }).where("host_id", "=", f.hostId).execute();
    const before = await (await fetchDisk()).json(), id = randomUUID();
    expect((await toggle("disk-local", 1, false, id)).status).toBe(200);
    expect((await (await toggle("disk-local", 1, false, id)).json()).duplicate).toBe(true);
    expect((await toggle("disk-local", 1, true, id)).status).toBe(409);
    expect((await toggle("disk-local", 1, true)).status).toBe(409);
    const off = await (await fetchDisk()).json();
    expect(off.assignment.applicability).toBe("disabled"); expect(off.assignment.checks).toEqual([]);
    expect(off.assignment.effective.warning_percent).toBe(90);
    expect((await (await fetchDisk(false)).json()).assignment.applicability).toBe("missing_capability");
    expect((await f.diskHealth()).state).toBe("disabled");
    const d = (await catalog()).find((s: { key: string }) => s.key === "disk-local");
    expect(d).toMatchObject({ revision: 1, enabled: false, enablement_version: 2 });
    expect(new Date(d.saved_at).toISOString()).toBe(d.saved_at);
    expect((await toggle("disk-local", 2, true)).status).toBe(200);
    expect((await f.diskHealth()).latest).toBeNull();
    const on = await (await fetchDisk()).json(); expect(on.assignment_id).not.toBe(before.assignment_id);
    expect(on.assignment.effective.warning_percent).toBe(90);
    expect((await toggle("disk-local", 3, false)).status).toBe(200);
    expect((await toggle("disk-local", 4, true)).status).toBe(200);
    const rapid = await (await fetchDisk()).json(); expect(rapid.assignment_id).not.toBe(on.assignment_id);
    expect(rapid.revision).toBeGreaterThan(on.revision);
  });
  it("retains late baseline history without satisfying a new enabled assignment", async () => {
    const old = f.baselines.find((a) => a.definition_key === "package-updates")!;
    expect((await toggle("package-updates", 1, false)).status).toBe(200);
    const off = (await wire(await f.fetch(undefined, ["exec_observe.debian13.v1", "skill-control.v1"]))).assignments;
    expect(off.find((a) => a.definition_key === "package-updates")!.assignment!.applicability).toBe("disabled");
    expect((await f.run(sample("package-updates", old, f.clock(), 1))).status).toBe(200);
    expect((await wire(await f.health())).checks.find((c) => c.definition_key === "package-updates")!.state).toBe("disabled");
    expect((await toggle("package-updates", 2, true)).status).toBe(200);
    const delivery = (await wire(await f.fetch())).assignments.find((a) => a.definition_key === "package-updates")!;
    let check = (await wire(await f.health())).checks.find((c) => c.definition_key === "package-updates")!;
    expect(check.state).toBe("unknown"); expect(check.latest).toBeNull(); expect(check.history).toHaveLength(1);
    expect((await f.run(sample("package-updates", old, f.clock(), 2))).status).toBe(200);
    expect((await wire(await f.health())).checks.find((c) => c.definition_key === "package-updates")!.state).toBe("unknown");
    expect((await f.run(sample("package-updates", delivery, f.clock(), 3))).status).toBe(200);
    check = (await wire(await f.health())).checks.find((c) => c.definition_key === "package-updates")!;
    expect(check.state).toBe("warning"); expect(check.latest!.assignment_id).toBe(delivery.assignment_id);
  });
  it("keeps Off through value edits, no-op requests and competing mutations", async () => {
    const replies = await Promise.all([toggle("disk-local", 1, false), toggle("disk-local", 1, false)]);
    expect(replies.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await (await toggle("disk-local", 2, false)).json()).toMatchObject({ changed: false, enablement_version: 2 });
    const r = await operatorUpdateDiskDefinition(f.req("/api/v1/operator/check-definitions/disk-local", {
      schema_version: 1, request_id: randomUUID(), expected_revision: 1, warning_percent: 80, critical_percent: 95, interval_seconds: 300,
    }, undefined, f.session), f.ctx);
    expect(r.status).toBe(200);
    expect((await catalog()).find((s: { key: string }) => s.key === "disk-local")).toMatchObject({ enabled: false, enablement_version: 2, revision: 2 });
    const off = await (await fetchDisk()).json();
    const rejected = f.disk(1); rejected.assignment_id = off.assignment_id;
    expect((await f.diskPost(rejected)).status).toBe(409);
  });
  it("requires current operator authority and same-origin mutation protection", async () => {
    const r = f.req("/api/v1/operator/skills/disk-local/enabled", { schema_version: 1, request_id: randomUUID(), expected_enablement_version: 1, enabled: false }, undefined, f.session);
    r.headers.delete("X-TinyWarden-Request");
    expect((await operatorSkillEnabled(r, "disk-local", f.ctx)).status).toBe(403);
    f.setTime(new Date(f.clock().getTime() + 1000));
    await f.db.updateTable("operator_sessions").set({ expires_at: f.clock() }).execute();
    expect((await toggle("disk-local", 1, false)).status).toBe(401);
    expect((await f.db.selectFrom("skill_enablement_receipts").selectAll().execute())).toHaveLength(0);
    expect((await f.db.selectFrom("check_definitions").select("enabled").executeTakeFirstOrThrow()).enabled).toBe(true);
  });
  it("retires pending alerts and recovery exposure across an unsampled Off/On cycle", async () => {
    await f.diskState(1, 90); await f.enqueue();
    expect((await f.events())[0]!.state).toBe("pending");
    await toggle("disk-local", 1, false); await toggle("disk-local", 2, true);
    await f.enqueue();
    expect((await f.events())[0]!.state).toBe("cancelled");
    const delivery = await (await fetchDisk()).json();
    const r = f.disk(2); r.assignment_id = delivery.assignment_id;
    expect((await f.diskPost(r)).status).toBe(200); await f.enqueue();
    expect((await f.events()).filter((e) => e.to_state === "healthy")).toHaveLength(0);
    await toggle("disk-local", 3, false); await f.enqueue(); await f.tick();
    expect(f.captured).toHaveLength(0);
  });
  it("records disable/resume as context and leaves Contact active with all skills Off", async () => {
    await f.diskState(1, 90);
    await runHistory(f.db, "tinywarden_test_p1b", f.clock);
    const configured = await f.db.selectFrom("history_control").select("epoch").executeTakeFirstOrThrow();
    await captureHistoryFamily(f.db, configured.epoch, f.hostId, "disk-local", f.clock);
    for (const key of ["disk-local", ...baselineKeys]) expect((await toggle(key, 1, false)).status).toBe(200);
    await captureHistoryFamily(f.db, configured.epoch, f.hostId, "disk-local", f.clock);
    await captureHistoryFamily(f.db, configured.epoch, f.hostId, "disk-local", f.clock);
    const events = await f.db.selectFrom("history_events").selectAll().execute();
    expect(events).toHaveLength(1); expect(events[0]).toMatchObject({ kind: "context", to_state: "disabled", to_reason: "skill_disabled" });
    const view = await readDashboard(f.db, f.session, {}, f.clock);
    expect(view.counts).toMatchObject({ attention: 0, unknown: 0, healthy: 1 });
    expect(view.groups.healthy.hosts[0]!.checks.every((c) => c.state === "disabled")).toBe(true);
    await toggle("disk-local", 2, true);
    await captureHistoryFamily(f.db, configured.epoch, f.hostId, "disk-local", f.clock);
    expect((await f.db.selectFrom("history_events").selectAll().orderBy("transition_number").execute())[1]!.kind).toBe("context");
    await toggle("disk-local", 3, false); await f.advanceSeconds(181);
    const agent = await f.db.selectFrom("agents").select("stale_after_seconds").executeTakeFirstOrThrow();
    await f.db.updateTable("agent_credentials").set({ accepted_at: new Date(f.clock().getTime() - (agent.stale_after_seconds + 1) * 1000) }).execute();
    expect((await readDashboard(f.db, f.session, {}, f.clock)).counts.unknown).toBe(1);
  });
  it("prevents post-Off claims and confines pre-Off send completion to the old scope", async () => {
    await f.diskState(1, 90); await f.enqueue();
    const old = (await f.events())[0]!;
    const claim = await claimEvent(f.db, old, f.settings, f.clock);
    expect(claim).not.toBeNull();
    await toggle("disk-local", 1, false); await toggle("disk-local", 2, true); await f.enqueue();
    await finishEvent(f.db, claim!.event, { kind: "captured", code: "capture_only" }, f.clock);
    const delivery = await (await fetchDisk()).json(), healthy = f.disk(2); healthy.assignment_id = delivery.assignment_id;
    expect((await f.diskPost(healthy)).status).toBe(200); await f.enqueue();
    expect((await f.events()).filter((e) => e.to_state === "healthy")).toHaveLength(0);
    const issue = f.disk(3); issue.assignment_id = delivery.assignment_id; issue.mounts[0]!.available_bytes = "10"; issue.mounts[0]!.free_bytes = "10";
    expect((await f.diskPost(issue)).status).toBe(200); await f.enqueue();
    const pending = (await f.events()).find((e) => e.state === "pending")!;
    expect(pending).toBeDefined(); await toggle("disk-local", 3, false);
    expect(await claimEvent(f.db, pending, f.settings, f.clock)).toBeNull();
    expect((await f.events()).find((e) => e.id === pending.id)!.state).toBe("cancelled");
  });
});
