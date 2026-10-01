import { evaluators, type Assessment, type FstrimEvidence } from "./baseline-types";
import { parseBaselineObservation } from "./baseline-values";

function assessment(state: Assessment["state"], reason: string, incomplete = true, informational = false): Assessment {
  return { state, reason, incomplete, informational };
}

// This evaluates observable evidence only. P3.C additionally gates CURRENT health
// by identity, recipe revision, recovery, contact and observation freshness.
export function evaluateBaseline(value: unknown, evaluator: string): Assessment {
  const observation = parseBaselineObservation(value);
  if (!observation || evaluator !== evaluators[observation.key]) return assessment("unknown", "unsupported_observation");
  if (observation.problem !== "none") return assessment("unknown", observation.problem);
  if (observation.packages) {
    const p = observation.packages;
    if (p.removed > 0) return assessment("warning", "package_removals");
    if (p.upgraded + p.installed + p.held_back > 0) return assessment("warning", "package_changes");
    return assessment("unknown", "package_cache_unverified", true, true);
  }
  if (observation.reboot) return observation.reboot.marker_observed ? assessment("warning", "reboot_marker_present")
    : assessment("unknown", "reboot_assurance_unverified", true, true);
  return evaluateFstrim(observation.fstrim!);
}

function evaluateFstrim(e: FstrimEvidence): Assessment {
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
