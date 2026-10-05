import { retentionCutoff } from "../../results/retention-policy";
import { maxEpoch, type BaselineObservation, type FstrimEvidence } from "../shared/types";

export const trimGraceSeconds = 86_400;
export type TrimExecution = { run_id: string; sequence: number; observed_at: number; recorded_at: string;
  started_at: number | null; finished_at: number | null; outcome: "success" | "failure"; trigger_at: number | null };
export type FstrimContext = { schema_version: 1; as_of: number; expected_at: number | null;
  last_trigger: number | null; covered_trigger: number | null; last_execution: TrimExecution | null };
export type TrimSample = { id: string; sequence: number; finished: Date; received: Date;
  observation: BaselineObservation | null };
const epoch = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0 && v <= maxEpoch;
const optionalEpoch = (v: unknown): v is number | null => v === null || epoch(v);
function object(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === keys.sort().join(",");
}
export function parseFstrimContext(value: unknown): FstrimContext | null {
  if (!object(value, ["schema_version", "as_of", "expected_at", "last_trigger", "covered_trigger", "last_execution"]) ||
    value.schema_version !== 1 || !epoch(value.as_of) || !optionalEpoch(value.expected_at) ||
    !optionalEpoch(value.last_trigger) || !optionalEpoch(value.covered_trigger) ||
    value.last_trigger !== null && value.last_trigger > value.as_of ||
    value.covered_trigger !== null && (value.last_trigger === null || value.covered_trigger > value.last_trigger)) return null;
  const e = value.last_execution;
  if (e !== null) {
    if (!object(e, ["run_id", "sequence", "observed_at", "recorded_at", "started_at", "finished_at", "outcome", "trigger_at"]) ||
      typeof e.run_id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(e.run_id) ||
      typeof e.sequence !== "number" || !Number.isSafeInteger(e.sequence) || e.sequence < 1 ||
      !epoch(e.observed_at) || e.observed_at > value.as_of || typeof e.recorded_at !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(e.recorded_at) ||
      !Number.isFinite(Date.parse(e.recorded_at)) || new Date(e.recorded_at).toISOString() !== e.recorded_at ||
      !optionalEpoch(e.started_at) || !optionalEpoch(e.finished_at) || !optionalEpoch(e.trigger_at) ||
      !["success", "failure"].includes(e.outcome as string) ||
      e.started_at !== null && e.started_at >= e.observed_at || e.finished_at !== null && e.finished_at >= e.observed_at ||
      e.started_at !== null && e.finished_at !== null && e.started_at > e.finished_at ||
      e.trigger_at !== null && (e.started_at === null || e.trigger_at > e.started_at) ||
      e.outcome === "success" && (e.started_at === null || e.finished_at === null)) return null;
  }
  return value as FstrimContext;
}
export function retainedTrimExecution(context: FstrimContext, at: Date): TrimExecution | null {
  const e = context.last_execution;
  return e && new Date(e.recorded_at) >= retentionCutoff(at) ? e : null;
}
function execution(sample: TrimSample, e: FstrimEvidence): TrimExecution | null {
  const s = e.service;
  const failure = s.active_state === "failed" || s.result !== "success" ||
    s.finished_at !== null && (s.exit_kind !== 1 || s.exit_status !== 0);
  const success = s.active_state === "inactive" && s.result === "success" && s.exit_kind === 1 && s.exit_status === 0 &&
    s.started_at !== null && s.finished_at !== null && s.condition.passed === true &&
    s.condition.checked_at !== null && s.condition.checked_at <= s.started_at;
  if ((!failure && !success) || s.load_state !== "loaded" || s.condition.passed === false) return null;
  return { run_id: sample.id, sequence: sample.sequence, observed_at: e.observed_at, recorded_at: sample.received.toISOString(),
    started_at: s.started_at, finished_at: s.finished_at, outcome: failure ? "failure" : "success",
    trigger_at: e.timer.last_trigger !== null && s.started_at !== null && e.timer.last_trigger <= s.started_at ? e.timer.last_trigger : null };
}
export function advanceFstrimContext(previous: FstrimContext | null, sample: TrimSample,
  includeSchedule = true): FstrimContext | null {
  const at = Math.floor(sample.finished.getTime() / 1000);
  if (!epoch(at) || includeSchedule && previous && at < previous.as_of) return null;
  const c: FstrimContext = previous ? { ...previous, last_execution: retainedTrimExecution(previous, sample.received) }
    : { schema_version: 1, as_of: at, expected_at: null, last_trigger: null, covered_trigger: null, last_execution: null };
  c.as_of = Math.max(c.as_of, at);
  const o = sample.observation, e = o?.fstrim;
  if (!e || o!.problem !== "none") return c;
  const candidate = execution(sample, e), old = c.last_execution;
  const same = candidate && old && candidate.outcome === old.outcome && candidate.started_at === old.started_at &&
    candidate.finished_at === old.finished_at;
  const laterSuccess = candidate?.outcome === "success" && (!old || old.outcome !== "failure" ||
    candidate.finished_at! > (old.finished_at ?? old.observed_at));
  if (candidate && !same && (!old || candidate.sequence > old.sequence) &&
    (candidate.outcome === "failure" || laterSuccess)) c.last_execution = candidate;
  const success = c.last_execution?.outcome === "success" ? c.last_execution : null;
  if (success && candidate?.outcome === "success" && candidate.finished_at === success.finished_at) {
    const trigger = candidate.trigger_at;
    const advanced = trigger !== null && trigger > (c.covered_trigger ?? 0);
    if (c.expected_at !== null && (success.finished_at! >= c.expected_at ||
      advanced && trigger! >= c.expected_at - trimGraceSeconds)) c.expected_at = null;
    if (trigger !== null) c.covered_trigger = Math.max(c.covered_trigger ?? 0, trigger);
  }
  if (!includeSchedule) return c;
  const t = e.timer, running = ["active", "activating", "deactivating", "reloading"].includes(e.service.active_state);
  if (previous && t.last_trigger !== null && t.last_trigger > (c.last_trigger ?? 0) &&
    t.last_trigger > (c.covered_trigger ?? 0)) c.expected_at = Math.min(c.expected_at ?? t.last_trigger, t.last_trigger);
  if (t.last_trigger !== null) c.last_trigger = Math.max(c.last_trigger ?? 0, t.last_trigger);
  if (t.load_state === "loaded" && t.active_state === "active" && ["enabled", "enabled-runtime"].includes(t.unit_file_state) &&
    t.condition.passed === true) {
    if (t.next_elapse !== null) c.expected_at = Math.min(c.expected_at ?? t.next_elapse, t.next_elapse);
    if (running) c.expected_at = Math.min(c.expected_at ?? at, at);
  }
  return c;
}
