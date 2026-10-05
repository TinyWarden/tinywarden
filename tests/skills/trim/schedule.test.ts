import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { assessBaseline } from "../../../server/skills/legacy/shared/assessment";
import { advanceFstrimContext, parseFstrimContext, trimGraceSeconds, type FstrimContext, type TrimSample } from "../../../server/skills/legacy/trim/context";
import { trimNextTransition } from "../../../server/skills/legacy/trim/assessment";
import type { BaselineObservation } from "../../../server/skills/legacy/shared/types";
import { parseBaselineObservation } from "../../../server/skills/legacy/shared/observation";
import { notificationFixture, database, url } from "../../p4b.fixture";
import { sample, wire } from "../baseline/fixture";
import { readDashboard } from "../../../server/fleet/dashboard";
import { runHistory } from "../../../server/history/run";

const day = 86_400, first = Date.parse("2026-10-03T17:00:00.000Z") / 1000;
function reading(at: number, sequence: number, kind: "success" | "empty" | "failure" = "success"): TrimSample {
  const o: BaselineObservation = JSON.parse(readFileSync(new URL("../../fixtures/agent/internal/baseline/testdata/fstrim-status/completed-service-and-schedule.json", import.meta.url), "utf8")).expected;
  const e = o.fstrim!;
  e.observed_at = at; e.timer.next_elapse = first + 2 * day; e.timer.last_trigger = first - 2 * day;
  e.timer.condition.checked_at = at - 10;
  Object.assign(e.service, { started_at: first - day, finished_at: first - day + 2, condition: { passed: true, checked_at: first - day - 1 } });
  if (kind === "empty") Object.assign(e.service, { started_at: null, finished_at: null, exit_kind: 0, condition: { passed: null, checked_at: null } });
  if (kind === "failure") Object.assign(e.service, { active_state: "failed", result: "exit-code", exit_status: 2 });
  return { id: randomUUID(), sequence, finished: new Date(at * 1000), received: new Date((at + 1) * 1000), observation: o };
}
function context(input: TrimSample, prior: FstrimContext | null = null) {
  const c = advanceFstrimContext(prior, input);
  expect(c).not.toBeNull(); expect(parseFstrimContext(c)).toEqual(c); return c!;
}
const assess = (input: TrimSample, c: unknown, at = input.finished) => assessBaseline(input.observation, "fstrim-systemd.v1", 3, c, at);
describe("T1 retained execution and scheduled deadlines", () => {
  it("preserves a verified success across reboot without requiring another trim", () => {
    const initial = reading(first, 1), reboot = reading(first + 3600, 2, "empty");
    expect(parseBaselineObservation(initial.observation)).not.toBeNull();
    const c = context(reboot, context(initial));
    expect(assess(reboot, c)).toMatchObject({ state: "healthy", reason: "fstrim_observed_success" });
    expect(c.last_execution?.run_id).toBe(initial.id);
    expect(assessBaseline(reboot.observation, "fstrim-systemd.v1", 2).reason).toBe("fstrim_history_unavailable");
  });
  it("does not manufacture success for a never-recorded service", () => {
    const input = reading(first, 1, "empty"), c = context(input);
    expect(assess(input, c)).toMatchObject({ state: "healthy", reason: "fstrim_scheduled", incomplete: true, informational: true });
    expect(c.last_execution).toBeNull();
  });
  it("keeps failure after reboot and rejects an older default success as recovery", () => {
    const failed = reading(first + 10, 2, "failure"), c = context(failed, context(reading(first, 1)));
    const reboot = reading(first + 20, 3, "empty");
    expect(assess(reboot, context(reboot, c)).reason).toBe("fstrim_service_failed");
    const staleSuccess = reading(first + 30, 4);
    expect(assess(staleSuccess, context(staleSuccess, c)).state).toBe("warning");
  });
  it("retains the missed deadline when systemd advances its upcoming date", () => {
    const initial = reading(first, 1), saved = context(initial), due = saved.expected_at!;
    const input = reading(due + trimGraceSeconds - 1, 2, "empty"); input.observation!.fstrim!.timer.next_elapse = due + 7 * day;
    const c = context(input, saved);
    expect(c.expected_at).toBe(due);
    expect(assess(input, c).reason).toBe("fstrim_awaiting_result");
    expect(assess(input, c, new Date((due + trimGraceSeconds) * 1000)).reason).toBe("fstrim_result_overdue");
    expect(trimNextTransition(c, input.finished)).toBe((due + trimGraceSeconds) * 1000);
    expect(trimNextTransition(c, new Date((due + trimGraceSeconds) * 1000))).toBe(Infinity);
  });
  it("accepts completion when the randomized trigger moves earlier after reboot", () => {
    const saved = context(reading(first, 1)), due = saved.expected_at!;
    const input = reading(due - 3000, 2), e = input.observation!.fstrim!;
    Object.assign(e.timer, { last_trigger: due - 3600, next_elapse: due + 7 * day });
    Object.assign(e.service, { started_at: due - 3598, finished_at: due - 3596, condition: { passed: true, checked_at: due - 3599 } });
    const c = context(input, saved);
    expect(c.expected_at).toBe(due + 7 * day); expect(assess(input, c).state).toBe("healthy");
  });
  it("does not postpone a pending deadline for a manual run before it", () => {
    const saved = context(reading(first, 1)), input = reading(first + 3600, 2);
    Object.assign(input.observation!.fstrim!.service, { started_at: first + 3000, finished_at: first + 3002,
      condition: { passed: true, checked_at: first + 2999 } });
    expect(context(input, saved).expected_at).toBe(saved.expected_at);
  });
  it("keeps collection and malformed-context failures explicit", () => {
    const saved = context(reading(first, 1)), input = reading(first + 10, 2, "empty");
    expect(assess(input, {}).reason).toBe("fstrim_context_unavailable");
    Object.assign(input.observation!, { problem: "output_unsupported", execution: [], fstrim: null });
    expect(assess(input, context(input, saved)).state).toBe("unknown");
  });
  it("expires copied evidence without renewing its age or losing an outstanding deadline", () => {
    const saved = context(reading(first, 1)), input = reading(first + 91 * day, 2, "empty");
    input.observation!.fstrim!.timer.next_elapse = first + 100 * day;
    const c = context(input, saved);
    expect(c.last_execution).toBeNull(); expect(c.expected_at).toBe(saved.expected_at);
    expect(assess(input, c).reason).toBe("fstrim_result_overdue");
  });
});

describe.skipIf(!url)("T1 persisted context and shared consumers", () => {
  let f: Awaited<ReturnType<typeof notificationFixture>> | undefined;
  let anchor: number;
  afterEach(async () => { await f?.db.destroy(); });
  async function setup() { f = await notificationFixture(); anchor = Math.floor(f.clock().getTime() / 1000) - 1; return f; }
  function run(t: Awaited<ReturnType<typeof notificationFixture>>, sequence: number, kind: "success" | "empty" | "failure") {
    const r = sample("fstrim-status", t.baselines[2]!, t.clock(), sequence);
    const observation = reading(Math.floor(Date.parse(r.finished_at) / 1000), sequence, kind).observation!;
    // Relative to the actual fixture clock, preserving the authored timer/service ordering.
    const delta = anchor - first, e = observation.fstrim!;
    e.timer.last_trigger! += delta; e.timer.next_elapse! += delta;
    if (e.service.started_at !== null) e.service.started_at += delta;
    if (e.service.finished_at !== null) e.service.finished_at += delta;
    if (e.service.condition.checked_at !== null) e.service.condition.checked_at += delta;
    r.observation = observation; return r;
  }
  it("seeds existing v2 evidence, preserves exact retries and does not rewrite history", async () => {
    const t = await setup(), initial = run(t, 1, "success");
    expect((await t.run(initial)).status).toBe(200);
    await t.db.updateTable("baseline_runs").set({ assessment_version: 2, fstrim_context: null }).where("id", "=", initial.run_id).execute();
    await t.advanceSeconds(60);
    const reboot = run(t, 2, "empty"); expect((await t.run(reboot)).status).toBe(200);
    const stored = await t.db.selectFrom("baseline_runs").selectAll().where("id", "=", reboot.run_id).executeTakeFirstOrThrow();
    expect((stored.fstrim_context as FstrimContext).last_execution?.run_id).toBe(initial.run_id);
    expect((await wire(await t.health())).checks[2]?.state).toBe("healthy");
    expect((await wire(await t.run(reboot))).duplicate).toBe(true);
    expect((await t.db.selectFrom("baseline_runs").selectAll().where("id", "=", reboot.run_id).executeTakeFirstOrThrow()).fstrim_context).toEqual(stored.fstrim_context);
    expect((await t.db.selectFrom("baseline_runs").select("assessment_version").where("id", "=", initial.run_id).executeTakeFirstOrThrow()).assessment_version).toBe(2);
  });
  it("incorporates delayed evidence only into the next fresh reading and retains failure priority", async () => {
    const t = await setup(), delayed = run(t, 1, "success");
    await t.advanceSeconds(60); const newer = run(t, 2, "empty");
    expect((await t.run(newer)).status).toBe(200);
    expect((await t.run(delayed)).status).toBe(200);
    const before = await t.db.selectFrom("baseline_runs").select("fstrim_context").where("id", "=", newer.run_id).executeTakeFirstOrThrow();
    expect((before.fstrim_context as FstrimContext).last_execution).toBeNull();
    await t.advanceSeconds(60); expect((await t.run(run(t, 3, "empty"))).status).toBe(200);
    expect((await wire(await t.health())).checks[2]?.reason).toBe("fstrim_observed_success");
    await t.advanceSeconds(60); expect((await t.run(run(t, 4, "failure"))).status).toBe(200);
    await t.advanceSeconds(60); expect((await t.run(run(t, 5, "empty"))).status).toBe(200);
    expect((await wire(await t.health())).checks[2]?.reason).toBe("fstrim_service_failed");
  });
  it("uses the same failure/recovery for dashboard, history and captured mail, while contact remains separate", async () => {
    const t = await setup();
    await t.diskState(1, 10);
    for (const [i, key] of ["package-updates", "reboot-required"].entries()) {
      const r = sample(key as "package-updates" | "reboot-required", t.baselines[i]!, t.clock(), i + 1);
      if (r.observation.packages) Object.assign(r.observation.packages, { upgraded: 0, installed: 0, removed: 0, held_back: 0 });
      expect((await t.run(r)).status).toBe(200);
    }
    expect((await t.run(run(t, 3, "failure"))).status).toBe(200);
    expect((await readDashboard(t.db, t.session, {}, t.clock)).counts.warning).toBe(1);
    await runHistory(t.db, database, t.clock); await t.tick();
    await t.advanceSeconds(60); const recovery = run(t, 4, "success"), e = recovery.observation.fstrim;
    e.service.started_at = e.observed_at - 3; e.service.finished_at = e.observed_at - 1; e.service.condition.checked_at = e.observed_at - 4;
    expect((await t.run(recovery)).status).toBe(200);
    await runHistory(t.db, database, t.clock); await t.tick();
    const view = await readDashboard(t.db, t.session, {}, t.clock);
    expect(view.counts.healthy).toBe(1); expect(view.groups.healthy.hosts[0]?.contact_state).toBe("current");
    const events = await t.db.selectFrom("history_events").select(["subject_key", "to_state"]).execute();
    expect(events).toContainEqual({ subject_key: "fstrim-status", to_state: "healthy" });
    expect(t.captured.at(-1)?.toString().replace(/=\r\n/g, "")).toContain("physical space reclamation is unverified");
    await t.advanceSeconds(200);
    await t.db.updateTable("agent_credentials").set({ accepted_at: new Date(t.clock().getTime() - 200_000) }).where("agent_id", "=", t.agentId).execute();
    expect((await wire(await t.health())).checks[2]?.reason).toBe("contact_unavailable");
  });
});
