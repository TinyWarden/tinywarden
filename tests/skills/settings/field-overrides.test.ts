import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { notificationFixture, url } from "../../p4b.fixture";
import { sample, wire } from "../baseline/fixture";
import { migrate } from "../../../server/db/migrate";
import { agentAssignments, operatorHostDiskPolicy, operatorSetHostDiskPolicy, operatorUpdateDiskDefinition } from "../../../server/http/handlers";
import { operatorSetBaselinePolicy } from "../../../server/http/baseline-handlers";
import { fingerprint } from "../../../server/validation";
import { runHistory } from "../../../server/history/run";
import { captureHistoryFamily } from "../../../server/history/sampling";

// Always uses the existing reserved database; notification transport captures locally.
describe.skipIf(!url)("U6 individual setting inheritance", () => {
  let f: Awaited<ReturnType<typeof notificationFixture>>;
  beforeEach(async () => { f = await notificationFixture(); });
  afterEach(async () => { await f?.db.destroy(); });
  const diskPath = () => `/api/v1/operator/hosts/${f.hostId}/checks/disk-local`;
  const disk = (overrides: object, version = 0, revision = 1, id = randomUUID()) => operatorSetHostDiskPolicy(f.req(diskPath(), {
    schema_version: 2, request_id: id, expected_policy_version: version, expected_default_revision: revision, overrides }, undefined, f.session), f.hostId, f.ctx);
  const view = async () => (await operatorHostDiskPolicy(f.req(diskPath(), undefined, undefined, f.session), f.hostId, f.ctx)).json();
  const defaults = (revision: number, warning = 85, critical = 95, interval = 300) => operatorUpdateDiskDefinition(f.req("/api/v1/operator/check-definitions/disk-local", {
    schema_version: 1, request_id: randomUUID(), expected_revision: revision, warning_percent: warning, critical_percent: critical, interval_seconds: interval }, undefined, f.session), f.ctx);
  const fetchDisk = async () => (await agentAssignments(f.req("/api/v1/agent/assignments", {
    schema_version: 1, agent_version: "0.0.2", capabilities: ["disk_usage.v1", "skill-control.v1"], known_assignment: null }, f.agentCredential), f.ctx)).json();
  const baseline = (key: string, overrides: object, version = 0, revision = 1, id = randomUUID()) => operatorSetBaselinePolicy(f.req(`/api/v1/operator/hosts/${f.hostId}/baselines/${key}`, {
    schema_version: 2, request_id: id, expected_policy_version: version, expected_default_revision: revision, overrides }, undefined, f.session), f.hostId, key, f.ctx);

  it("inherits independently, preserves equal custom intent, and resets only selected fields", async () => {
    expect((await disk({ warning_percent: 90 })).status).toBe(200);
    expect((await defaults(1, 90, 97, 600)).status).toBe(200);
    expect(await view()).toMatchObject({ schema_version: 2, overrides: { warning_percent: 90 }, effective_values: { warning_percent: 90, critical_percent: 97, interval_seconds: 600 } });
    expect(await (await disk({ warning_percent: 90 }, 1, 2)).json()).toMatchObject({ changed: false, policy_version: 1 });
    expect((await defaults(2, 80, 98, 900)).status).toBe(200);
    expect((await view()).effective_values.warning_percent).toBe(90);
    expect((await disk({ warning_percent: 90, interval_seconds: 120 }, 1, 3)).status).toBe(200);
    expect((await disk({ interval_seconds: 120 }, 2, 3)).status).toBe(200);
    expect((await view()).effective_values).toEqual({ warning_percent: 80, critical_percent: 98, interval_seconds: 120 });
    expect((await disk({}, 3, 3)).status).toBe(200); expect((await view()).mode).toBe("inherit");
    expect((await disk({ warning_percent: 80 }, 4, 3)).status).toBe(200);
    expect(await (await disk({}, 5, 3)).json()).toMatchObject({ changed: true, policy_version: 6 });
  });
  it("rejects stale versions, malformed subsets and changed retries; exact retries replay", async () => {
    const id = randomUUID(); expect((await disk({ warning_percent: 90 }, 0, 1, id)).status).toBe(200);
    expect(await (await disk({ warning_percent: 90 }, 0, 1, id)).json()).toMatchObject({ duplicate: true, policy_version: 1 });
    expect((await disk({ warning_percent: 91 }, 0, 1, id)).status).toBe(409);
    expect((await disk({}, 0, 1)).status).toBe(409); expect((await disk({}, 1, 2)).status).toBe(409);
    for (const bad of [{ warning_percent: 99 }, { unknown: 3 }, { interval_seconds: "600" }, { critical_percent: null }, []]) expect((await disk(bad, 1)).status).toBe(400);
    expect((await baseline("reboot-required", { package_mode: "upgrade" })).status).toBe(400);
    expect((await baseline("fstrim-status", { timeout_seconds: 31 })).status).toBe(400);
    expect((await f.db.selectFrom("host_check_policy_revisions").selectAll().where("host_id", "=", f.hostId).execute())).toHaveLength(2);
  });
  it("serializes competing saves and rejects mixed global thresholds atomically, even for revoked hosts", async () => {
    const replies = await Promise.all([disk({ warning_percent: 90 }), disk({ interval_seconds: 600 })]);
    expect(replies.map((r) => r.status).sort()).toEqual([200, 409]);
    const v = await view(); if (!v.overrides.warning_percent) expect((await disk({ warning_percent: 90 }, 1)).status).toBe(200);
    await f.db.updateTable("agents").set({ revoked_at: f.clock() }).where("id", "=", f.agentId).execute();
    const result = await defaults(1, 80, 89); expect(result.status).toBe(409);
    expect((await result.json()).error.code).toBe("default_override_conflict");
    expect((await f.db.selectFrom("check_definitions").selectAll().executeTakeFirstOrThrow()).current_revision).toBe("1");
    expect((await defaults(1, 80, 97)).status).toBe(200);
  });
  it("serializes a global edit against a newly customized threshold", async () => {
    const r = await Promise.all([disk({ warning_percent: 90 }), defaults(1, 80, 89)]);
    expect(r.map((x) => x.status).sort()).toEqual([200, 409]);
    const v = await view(); expect(v.effective_values.warning_percent).toBeLessThan(v.effective_values.critical_percent);
    expect(v.policy_version + v.current_default_revision).toBe(2);
  });
  it("preserves all baseline custom fields through defaults and keeps full overrides pinned", async () => {
    for (const key of ["package-updates", "reboot-required", "fstrim-status"] as const) {
      expect((await baseline(key, { timeout_seconds: 11, ...(key === "package-updates" ? { package_mode: "upgrade" } : {}) })).status).toBe(200);
      expect((await f.edit(key, 1, { interval_seconds: 600, timeout_seconds: 12, package_mode: key === "package-updates" ? "with-new-pkgs" : "upgrade" })).status).toBe(200);
      const v = await wire(await f.policy(key)); expect(v.effective_values).toEqual({ interval_seconds: 600, timeout_seconds: 11, package_mode: "upgrade" });
      const all = { interval_seconds: 900, timeout_seconds: 13, ...(key === "package-updates" ? { package_mode: "upgrade" } : {}) };
      expect((await baseline(key, all, 1, 2)).status).toBe(200);
      expect((await f.edit(key, 2, { interval_seconds: 1200, timeout_seconds: 14, package_mode: "upgrade" })).status).toBe(200);
      const delivery = (await wire(await f.fetch())).assignments.find((a) => a.definition_key === key)!;
      expect(delivery.assignment!.definition_revision).toBe(2); expect(delivery.assignment!.timeout_seconds).toBe(13);
      expect((await baseline(key, {}, 2, 3)).status).toBe(200);
      expect((await wire(await f.policy(key))).effective_values.interval_seconds).toBe(1200);
    }
  });
  it("shares desired scope across delivery, current evidence, context history and captured mail", async () => {
    await f.diskState(1, 90); await f.enqueue();
    await runHistory(f.db, "tinywarden_test_p1b", f.clock);
    const epoch = (await f.db.selectFrom("history_control").selectAll().executeTakeFirstOrThrow()).epoch;
    await captureHistoryFamily(f.db, epoch, f.hostId, "disk-local", f.clock);
    expect((await disk({ warning_percent: 88 })).status).toBe(200);
    const a = await fetchDisk(); expect(a.assignment.effective.warning_percent).toBe(88);
    expect((await fetchDisk()).assignment_id).toBe(a.assignment_id);
    expect((await f.diskHealth()).latest).toBeNull();
    await captureHistoryFamily(f.db, epoch, f.hostId, "disk-local", f.clock); await f.enqueue();
    expect((await f.events())[0]!.state).toBe("cancelled");
    const events = await f.db.selectFrom("history_events").selectAll().execute(); expect(events[0]!.kind).toBe("context");
    expect((await f.diskPost(f.disk(2))).status).toBe(200); expect((await f.diskHealth()).latest).toBeNull();
    const current = f.disk(3); current.assignment_id = a.assignment_id; expect((await f.diskPost(current)).status).toBe(200);
    expect((await f.diskHealth()).state).toBe("healthy");
    expect((await defaults(1, 80, 97)).status).toBe(200);
    expect((await f.diskHealth()).latest).toBeNull();
    const next = await fetchDisk(); expect(next.assignment.definition_revision).toBe(2); expect(next.assignment.effective.warning_percent).toBe(88);
    expect(next.assignment_id).not.toBe(a.assignment_id); expect(f.captured).toHaveLength(0);
  });
  it("retains trim execution context and old baseline runs when settings scope changes", async () => {
    const old = f.baselines.find((a) => a.definition_key === "fstrim-status")!;
    expect((await f.run(sample("fstrim-status", old, f.clock(), 1))).status).toBe(200);
    const before = (await wire(await f.health())).checks.find((c) => c.definition_key === "fstrim-status")!.latest!.fstrim_context;
    expect((await baseline("fstrim-status", { timeout_seconds: 11 })).status).toBe(200);
    const fresh = (await wire(await f.fetch())).assignments.find((a) => a.definition_key === "fstrim-status")!;
    expect((await f.run(sample("fstrim-status", old, f.clock(), 2))).status).toBe(200);
    expect((await wire(await f.health())).checks.find((c) => c.definition_key === "fstrim-status")!.latest).toBeNull();
    const r = sample("fstrim-status", fresh, f.clock(), 3); r.observation.fstrim.service.started_at = null; r.observation.fstrim.service.finished_at = null;
    expect((await f.run(r)).status).toBe(200);
    expect((await wire(await f.health())).checks.find((c) => c.definition_key === "fstrim-status")!.latest!.fstrim_context!.last_execution).toEqual(before!.last_execution);
  });
  it("replays exact legacy receipts but refuses fresh v1 mutations", async () => {
    const id = randomUUID(), operator = await f.db.selectFrom("operators").select("id").executeTakeFirstOrThrow();
    await f.db.insertInto("check_mutation_receipts").values({ operator_id: operator.id, request_id: id, root: "SetHostDiskPolicy", definition_key: "disk-local", host_id: f.hostId,
      request_fingerprint: fingerprint([1, "SetHostDiskPolicy", "disk-local", f.hostId, null, 0, 1, "inherit", null, null, null]), changed: false, resulting_definition_revision: null, resulting_policy_version: 0, completed_at: f.clock() }).execute();
    const old = (requestId: string) => operatorSetHostDiskPolicy(f.req(diskPath(), { schema_version: 1, request_id: requestId, expected_policy_version: 0, expected_default_revision: 1, mode: "inherit" }, undefined, f.session), f.hostId, f.ctx);
    expect(await (await old(id)).json()).toMatchObject({ duplicate: true }); expect((await old(randomUUID())).status).toBe(409);
    const bid = randomUUID(); await f.db.insertInto("baseline_receipts").values({ operator_id: operator.id, request_id: bid, root: "SetBaselinePolicy", definition_key: "reboot-required", host_id: f.hostId,
      request_fingerprint: fingerprint([1, "SetBaselinePolicy", "reboot-required", f.hostId, 0, 1, "inherit", null]), changed: false, resulting_definition_revision: null, resulting_policy_version: 0, completed_at: f.clock() }).execute();
    const oldBaseline = (id: string) => operatorSetBaselinePolicy(f.req(`/api/v1/operator/hosts/${f.hostId}/baselines/reboot-required`, {
      schema_version: 1, request_id: id, expected_policy_version: 0, expected_default_revision: 1, mode: "inherit" }, undefined, f.session), f.hostId, "reboot-required", f.ctx);
    expect((await wire(await oldBaseline(bid))).duplicate).toBe(true);
    expect((await oldBaseline(randomUUID())).status).toBe(409);
  });
  it("upgrades populated policies additively and rejects noncanonical stored masks", async () => {
    const before = await f.db.selectFrom("check_assignment_snapshots").selectAll().execute();
      await sql`DROP TABLE tinywarden.skill_runtime_hosts,tinywarden.skill_package_mutations,
        tinywarden.skill_package_receipts,tinywarden.skill_states,tinywarden.skill_observations,
        tinywarden.skill_assignments,tinywarden.host_skill_policy_revisions,tinywarden.host_skill_policies,
        tinywarden.skill_settings_revisions,tinywarden.skill_installations,tinywarden.skill_packages`.execute(f.db);
    await sql`ALTER TABLE tinywarden.host_check_policy_revisions DROP COLUMN override_fields`.execute(f.db);
    await sql`ALTER TABLE tinywarden.baseline_policy_revisions DROP COLUMN override_fields`.execute(f.db);
    await sql`DROP FUNCTION tinywarden.canonical_override_fields(text[])`.execute(f.db);
    await sql`DELETE FROM tinywarden.kysely_migration WHERE name>='013_field_overrides'`.execute(f.db);
    await f.db.insertInto("host_check_policy_revisions").values({ host_id: f.hostId, definition_key: "disk-local", version: 1, mode: "override", warning_percent: 90, critical_percent: 98, interval_seconds: 600, pinned_definition_revision: 1, created_at: f.clock() }).execute();
    await f.db.updateTable("host_check_policies").set({ current_policy_version: 1 }).where("host_id", "=", f.hostId).execute();
    await migrate(url!, "tinywarden_test_p1b");
    expect(await f.db.selectFrom("check_assignment_snapshots").selectAll().execute()).toEqual(before);
    expect((await view()).overrides).toEqual({ warning_percent: 90, critical_percent: 98, interval_seconds: 600 });
    for (const mask of [["warning_percent", "warning_percent"], ["warning_percent", "critical_percent"], ["other"], [null], []]) {
      await expect(sql`UPDATE tinywarden.host_check_policy_revisions SET override_fields=${mask}::text[] WHERE host_id=${f.hostId} AND version=1`.execute(f.db)).rejects.toThrow();
    }
    expect((await defaults(1, 80, 97, 900)).status).toBe(200);
    const a = await fetchDisk(); expect(a.assignment.definition_revision).toBe(1); expect(a.assignment.effective.warning_percent).toBe(90);
  });
});
