import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { notificationFixture, database, url } from "./p4b.fixture";
import { sample, wire } from "./skills/baseline/fixture";
import { baselineKeys } from "../server/skills/legacy/shared/types";
import { readDashboard } from "../server/fleet/dashboard";
import { readHistory, historyOptions } from "../server/history/reads";
import { runHistory, resetHistory, withHistoryLock } from "../server/history/run";
import { recordHistorySample } from "../server/history/transitions";
import { pruneExpiredObservations } from "../server/maintenance/retention";

describe.skipIf(!url)("U1 authorized fleet and durable observed history", () => {
  let f: Awaited<ReturnType<typeof notificationFixture>>;
  beforeEach(async () => { f = await notificationFixture(); });
  afterEach(async () => { await f?.db.destroy(); });
  const dashboard = () => readDashboard(f.db, f.session, {}, f.clock);
  const tick = () => runHistory(f.db, database, f.clock);
  async function cleanBaselines(sequence = 1) {
    for (const [index, key] of baselineKeys.entries()) {
      const run = sample(key, f.baselines.find((a) => a.definition_key === key)!, f.clock(), index + sequence);
      if (run.observation.packages) Object.assign(run.observation.packages, { upgraded: 0, installed: 0, removed: 0, held_back: 0 });
      expect((await f.run(run)).status).toBe(200);
    }
  }
  it("passes only scoped clean readings, records real changes independently of email and paginates equal-time events", async () => {
    await f.diskState(1, 10); await cleanBaselines();
    expect((await dashboard()).counts).toMatchObject({ total: 1, healthy: 1, attention: 0, unknown: 0 });
    expect(await tick()).toMatchObject({ sampled: 1, events: 0 });
    expect((await dashboard()).groups.healthy.hosts[0]!.since).toBe(f.clock().toISOString());
    await f.advanceSeconds(60); await f.diskState(2, 90);
    expect(await tick()).toMatchObject({ events: 1 });
    const first = await dashboard();
    expect(first.counts).toMatchObject({ attention: 1, warning: 1, healthy: 0 });
    expect(first.history?.events[0]).toMatchObject({ subject_key: "disk-local", from_state: "healthy", to_state: "warning" });
    expect((await f.db.selectFrom("notification_outbox").selectAll().execute()).length).toBe(0);
    expect(await tick()).toEqual({ outcome: "cooldown" });
    await f.advanceSeconds(60); await f.diskState(3, 96); expect(await tick()).toMatchObject({ events: 1 });
    const events = await f.db.selectFrom("history_events").selectAll().execute();
    await f.db.updateTable("history_events").set({ observed_at: f.clock() }).execute();
    const page = await readHistory(f.db, f.session, { limit: 1 }, f.clock);
    const next = await readHistory(f.db, f.session, historyOptions(`?limit=1&cursor=${page.next_cursor}`), f.clock);
    expect(new Set([page.events[0]!.id, next.events[0]!.id])).toEqual(new Set(events.map((event) => event.id)));
    await expect(readDashboard(f.db, "invalid", {}, f.clock)).rejects.toThrow();
  });
  it("preserves stored legacy assessment on an exact retry and stamps only a new run", async () => {
    const delivery = f.baselines.find((a) => a.definition_key === "reboot-required")!;
    const run = sample("reboot-required", delivery, f.clock(), 1);
    expect((await f.run(run)).status).toBe(200);
    // Model an already accepted v1 reading without changing its immutable request digest.
    await f.db.updateTable("baseline_runs").set({ assessment_version: 1 }).where("id", "=", run.run_id).execute();
    expect((await wire(await f.health())).checks.find((c) => c.definition_key === "reboot-required")!.state).toBe("unknown");
    expect((await f.run(run)).status).toBe(200);
    expect((await f.db.selectFrom("baseline_runs").select("assessment_version").where("id", "=", run.run_id).executeTakeFirstOrThrow()).assessment_version).toBe(1);
    expect((await f.run({ ...run, dropped_runs: 1 })).status).toBe(409);
    expect((await f.run(sample("reboot-required", delivery, f.clock(), 2))).status).toBe(200);
    const check = (await wire(await f.health())).checks.find((c) => c.definition_key === "reboot-required")!;
    expect(check.state).toBe("healthy"); expect(check.history.map((r) => r.assessment_version).sort()).toEqual([1, 3]);
  });
  it("omits expired continuity before capture resumes and preserves the exact 180-second boundary", async () => {
    await f.diskState(1, 90); await tick();
    const first = f.clock().toISOString();
    await f.advanceSeconds(180);
    expect((await dashboard()).groups.attention.hosts[0]!.since).toBe(first);
    await f.advanceSeconds(1); await f.diskState(2, 91);
    const paused = await dashboard();
    expect(paused.counts.attention).toBe(1); expect(paused.history?.lagging).toBe(true);
    expect(paused.groups.attention.hosts[0]!.since).toBeNull();
    await tick();
    expect((await dashboard()).groups.attention.hosts[0]!.since).toBe(f.clock().toISOString());
  });
  it("requires current continuity from every healthy subject even when the worker is current", async () => {
    await f.diskState(1, 10); await cleanBaselines(); await tick();
    const first = f.clock();
    await f.advanceSeconds(240); await f.diskState(2, 10); await cleanBaselines(4); await tick();
    await f.db.updateTable("history_subjects").set({ last_sample_at: new Date(f.clock().getTime() - 181000),
      continuous_since: first }).where("host_id", "=", f.hostId).where("subject_key", "=", "fstrim-status").execute();
    const view = await dashboard();
    expect(view.counts.healthy).toBe(1); expect(view.history?.lagging).toBe(false);
    expect(view.groups.healthy.hosts[0]!.since).toBeNull();
  });
  it("keeps fresh known disk trouble with incomplete coverage and rejects it once stale", async () => {
    const run = f.disk(1); run.coverage = "incomplete"; run.reason = "collector_failed";
    run.mounts[0]!.available_bytes = "3"; run.mounts[0]!.free_bytes = "3";
    expect((await f.diskPost(run)).status).toBe(200);
    expect((await dashboard()).counts).toMatchObject({ critical: 1, attention: 1, unknown: 0 });
    expect((await dashboard()).groups.attention.hosts[0]).toMatchObject({ uncertainty: true, worst_disk: { path: "/" } });
    await f.advanceSeconds(901);
    expect((await dashboard()).counts).toMatchObject({ attention: 0, unknown: 1 });
  });
  it("records observation gaps, suspension and a restore epoch without inventing check recoveries", async () => {
    await f.diskState(1, 90); await tick();
    await f.advanceSeconds(200); await f.diskState(2, 10); await tick();
    let events = await f.db.selectFrom("history_events").selectAll().execute();
    expect(events.find((e) => e.subject_key === "disk-local" && e.kind === "state")).toMatchObject({ after_gap: true, to_state: "healthy" });
    await f.advanceSeconds(60);
    await f.db.updateTable("agent_credentials").set({ accepted_at: new Date(f.clock().getTime() - 200000) }).execute();
    await tick();
    events = await f.db.selectFrom("history_events").selectAll().execute();
    expect(events.find((e) => e.subject_key === "contact" && e.to_state === "offline")).toBeTruthy();
    const stateCount = events.filter((e) => e.kind === "state").length;
    await f.advanceSeconds(60); await tick();
    expect((await f.db.selectFrom("history_events").selectAll().where("kind", "=", "state").execute()).length).toBe(stateCount + 1);
    await resetHistory(f.db, database, f.clock); await f.advanceSeconds(60); await tick();
    expect((await dashboard()).history?.activated_at).toBeTruthy();
    expect((await dashboard()).history?.events.filter((e) => e.kind === "state").length).toBe(stateCount + 1);
  });
  it("rejects older samples, rolls back failed event writes and clears expired facts within the cleanup lane", async () => {
    await f.diskState(1, 90);
    const retainedRun = sample("reboot-required", f.baselines.find((a) => a.definition_key === "reboot-required")!, f.clock(), 1);
    expect((await f.run(retainedRun)).status).toBe(200); await tick();
    const cursor = await f.db.selectFrom("history_subjects").selectAll().where("subject_key", "=", "disk-local").executeTakeFirstOrThrow();
    const capturedSample = { ...cursor, key: cursor.subject_key, as_of: new Date(f.clock().getTime() - 1).toISOString(), facts: {}, suspend: false };
    await expect(f.db.transaction().execute((trx) => recordHistorySample(trx, cursor.epoch, capturedSample))).rejects.toThrow("history_clock_rollback");
    await expect(f.db.transaction().execute(async (trx) => {
      await recordHistorySample(trx, cursor.epoch, { ...capturedSample, as_of: f.clock().toISOString(), state: "critical" });
      throw new Error("forced_rollback");
    })).rejects.toThrow("forced_rollback");
    expect((await f.db.selectFrom("history_events").selectAll().execute()).length).toBe(0);
    const future = new Date(f.clock().getTime() + 91 * 86400000);
    const result = await pruneExpiredObservations(f.db, database, true, () => future);
    expect(result.outcome).toBe("complete"); expect(result.history_cursors).toBeGreaterThan(0);
    expect((await f.db.selectFrom("history_subjects").selectAll().where("id", "=", cursor.id).executeTakeFirstOrThrow()).facts).toBeNull();
    expect((await f.run(retainedRun)).status).toBe(200);
    expect((await f.db.selectFrom("baseline_runs").selectAll().execute()).length).toBe(0);
  });
  it("keeps whole-fleet counts independent of visible pages and rechecks authorization on completion", async () => {
    const original = await f.db.selectFrom("hosts").selectAll().where("id", "=", f.hostId).executeTakeFirstOrThrow();
    for (let i = 0; i < 27; i++) {
      const id = randomUUID();
      await f.db.insertInto("hosts").values({ ...original, id, label: `pagination-${i}` }).execute();
      await f.db.insertInto("agents").values({ id: randomUUID(), host_id: id, current_generation: 1,
        enrolled_at: f.clock(), revoked_at: null, heartbeat_interval_seconds: 60, stale_after_seconds: 180 }).execute();
    }
    const first = await dashboard();
    expect(first.counts).toMatchObject({ total: 28, unknown: 28 });
    expect(first.groups.unknown.hosts).toHaveLength(25);
    const { dashboardOptions } = await import("../server/fleet/dashboard-model");
    const next = await readDashboard(f.db, f.session, dashboardOptions(`?unknown=${first.groups.unknown.next_cursor}`), f.clock);
    expect(next.counts.total).toBe(28); expect(next.groups.unknown.hosts).toHaveLength(3);
    let calls = 0;
    await expect(readDashboard(f.db, f.session, {}, () => new Date(f.clock().getTime() + (calls++ ? 1800001 : 0))))
      .rejects.toThrow("unauthorized");
    let elapsed = 0;
    await expect(readDashboard(f.db, f.session, {}, f.clock, () => elapsed++ ? 20001 : 0)).rejects.toThrow("temporarily_unavailable");
  });
  it("excludes a competing capture invocation with the exact-session job lock", async () => {
    await withHistoryLock(f.db, database, async () => {
      expect(await withHistoryLock(f.db, database, async () => ({ outcome: "unexpected" }))).toEqual({ outcome: "busy" });
    });
  });
});
