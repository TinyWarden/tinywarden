import { object, integer, member, states, timestamp, condition } from "../shared/json";
import { maxEpoch } from "../shared/types";

export function validTrim(value: unknown): boolean {
  if (!object(value, "timer service observed_at reclamation_verified") || value.reclamation_verified !== false ||
    !integer(value.observed_at, maxEpoch, 1)) return false;
  const observedAt = value.observed_at;
  const t = value.timer, s = value.service;
  if (!object(t, "load_state active_state unit_file_state last_trigger next_elapse condition") || !states(t) ||
    !member(t.unit_file_state, "|enabled|enabled-runtime|linked|linked-runtime|alias|static|indirect|disabled|masked|masked-runtime|generated|transient|bad") ||
    !timestamp(t.last_trigger) || !timestamp(t.next_elapse) || !condition(t.condition)) return false;
  if (!object(s, "load_state active_state result exit_kind exit_status started_at finished_at condition") || !states(s) ||
    !member(s.result, "success|resources|timeout|exit-code|signal|core-dump|watchdog|start-limit-hit|protocol|exec-condition|oom-kill") ||
    !integer(s.exit_kind, 6) || !integer(s.exit_status, 255) || !timestamp(s.started_at) ||
    !timestamp(s.finished_at) || !condition(s.condition)) return false;
  if (s.exit_kind === 0 && s.exit_status !== 0 || (s.exit_kind === 2 || s.exit_kind === 3) &&
    (!integer(s.exit_status, 64, 1))) return false;
  const tc = t.condition as { checked_at: number | null }, sc = s.condition as { checked_at: number | null };
  return [t.last_trigger, s.started_at, s.finished_at, tc.checked_at, sc.checked_at].every((v) =>
    v === null || Number(v) <= observedAt) &&
    (t.next_elapse === null || Number(t.next_elapse) > observedAt) &&
    (s.started_at === null || s.finished_at === null || Number(s.started_at) <= Number(s.finished_at));
}
