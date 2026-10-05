import type { Assessment, FstrimEvidence } from "../shared/types";
import { parseFstrimContext, retainedTrimExecution, trimGraceSeconds } from "./context";

const result = (state: Assessment["state"], reason: string, incomplete = true, informational = false): Assessment =>
  ({ state, reason, incomplete, informational });
export function assessFstrim(e: FstrimEvidence, raw: unknown, at: Date): Assessment {
  const c = parseFstrimContext(raw);
  if (!c || !Number.isFinite(at.getTime()) || Math.floor(at.getTime() / 1000) < c.as_of || c.as_of !== e.observed_at) {
    return result("unknown", "fstrim_context_unavailable");
  }
  const t = e.timer, s = e.service;
  if (["disabled", "masked", "masked-runtime"].includes(t.unit_file_state)) return result("warning", "fstrim_timer_disabled");
  if (t.load_state !== "loaded" || s.load_state !== "loaded") return result("unknown", "fstrim_unit_unavailable");
  if (t.condition.passed === false || s.condition.passed === false) return result("unknown", "fstrim_condition_skipped", true, true);
  if (t.active_state === "failed") return result("warning", "fstrim_timer_failed");
  if (t.active_state === "inactive") return result("warning", "fstrim_timer_inactive");
  const running = ["active", "activating", "deactivating", "reloading"].includes(s.active_state);
  if (t.active_state !== "active" || !["inactive", "failed"].includes(s.active_state) && !running) return result("unknown", "fstrim_running", true, true);
  if (!["enabled", "enabled-runtime"].includes(t.unit_file_state) || t.next_elapse === null && !running ||
    c.expected_at === null) return result("unknown", "fstrim_schedule_unverified");
  if (t.condition.checked_at === null || t.condition.passed !== true) return result("unknown", "fstrim_condition_unverified");
  if (s.started_at !== null && s.finished_at === null && !running ||
    s.finished_at !== null && (s.started_at === null || s.exit_kind === 0 ||
      s.condition.checked_at !== null && s.condition.checked_at > s.started_at!)) return result("unknown", "evidence_inconsistent");
  const last = retainedTrimExecution(c, at);
  if (s.active_state === "failed" || s.result !== "success" || last?.outcome === "failure") return result("warning", "fstrim_service_failed");
  const now = at.getTime() / 1000;
  if (now >= c.expected_at + trimGraceSeconds) return result("warning", "fstrim_result_overdue");
  if (running || now >= c.expected_at || c.last_trigger !== null && c.last_trigger > (c.covered_trigger ?? 0) &&
    c.last_trigger >= c.expected_at - trimGraceSeconds) return result("healthy", "fstrim_awaiting_result", true, true);
  return last?.outcome === "success" ? result("healthy", "fstrim_observed_success", false)
    : result("healthy", "fstrim_scheduled", true, true);
}
export function trimNextTransition(raw: unknown, at: Date): number {
  const c = parseFstrimContext(raw);
  if (!c?.expected_at) return Infinity;
  const now = at.getTime();
  return [c.expected_at * 1000, (c.expected_at + trimGraceSeconds) * 1000]
    .find((instant) => instant > now) ?? Infinity;
}
