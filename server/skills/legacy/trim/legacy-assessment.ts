import type { Assessment, FstrimEvidence } from "../shared/types";
import { assessment } from "../shared/assessment-result";

export function evaluateTrim(e: FstrimEvidence): Assessment {
  const t = e.timer, s = e.service;
  if (["disabled", "masked", "masked-runtime"].includes(t.unit_file_state)) return assessment("warning", "fstrim_timer_disabled");
  if (t.load_state !== "loaded" || s.load_state !== "loaded") return assessment("unknown", "fstrim_unit_unavailable");
  if (t.condition.passed === false || s.condition.passed === false) return assessment("unknown", "fstrim_condition_skipped", true, true);
  if (t.active_state === "failed") return assessment("warning", "fstrim_timer_failed");
  if (t.active_state === "inactive") return assessment("warning", "fstrim_timer_inactive");
  if (t.active_state !== "active" || !["inactive", "failed"].includes(s.active_state)) {
    return assessment("unknown", "fstrim_running", true, true);
  }
  if (s.started_at === null && s.finished_at === null) return s.active_state === "failed"
    ? assessment("warning", "fstrim_service_failed") : assessment("unknown", "fstrim_history_unavailable");
  if (s.started_at === null || s.finished_at === null || s.exit_kind === 0 ||
    s.condition.checked_at !== null && s.condition.checked_at > s.started_at) return assessment("unknown", "evidence_inconsistent");
  if (s.result !== "success" || s.exit_kind !== 1 || s.exit_status !== 0 || s.active_state === "failed") {
    return assessment("warning", "fstrim_service_failed");
  }
  if (t.last_trigger === null || t.last_trigger > s.started_at) return assessment("unknown", "fstrim_trigger_unconfirmed");
  if (!["enabled", "enabled-runtime"].includes(t.unit_file_state) || t.next_elapse === null) return assessment("unknown", "fstrim_schedule_unverified");
  if (t.condition.checked_at === null || s.condition.checked_at === null) return assessment("unknown", "fstrim_condition_unverified");
  return assessment("healthy", "fstrim_observed_success", false);
}
