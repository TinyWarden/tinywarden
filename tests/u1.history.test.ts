import {captureHistoricalFixture as runHistory} from "./p4b.fixture";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { notificationFixture, database, url } from "./p4b.fixture";
import { sample, wire } from "./skills/baseline/fixture";
import { readDashboard } from "../server/fleet/dashboard";
import { resetHistory, withHistoryLock } from "../server/history/run";
import { recordHistorySample } from "../server/history/transitions";
import { pruneExpiredObservations } from "../server/maintenance/retention";

describe.skipIf(!url)("U1 authorized fleet and durable observed history", () => {
  let f: Awaited<ReturnType<typeof notificationFixture>>;
  beforeEach(async () => { f = await notificationFixture(); });
  afterEach(async () => { await f?.db.destroy(); });
  const dashboard = () => readDashboard(f.db, f.session, {}, f.clock);
  const tick = () => runHistory(f.db, database, f.clock);

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



  it("records observation gaps, suspension and a restore epoch without inventing check recoveries", async () => {
    await f.diskState(1, 90); await tick();
    await f.advanceSeconds(200); await f.diskState(2, 10); await tick();
    let events = await f.db.selectFrom("history_events").selectAll().execute();
    expect(events.find((e) => e.subject_key === "disk-local" && e.kind === "state")).toMatchObject({ after_gap: true, to_state: "healthy" });
    await f.advanceSeconds(60);
    await f.db.updateTable("agent_credentials").set({ accepted_at: new Date(f.clock().getTime() - 200000), last_contact_at: new Date(f.clock().getTime() - 200000) }).execute();
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
