export { baselineKeys, normalizers, evaluators } from "../../../../lib/skills/catalog";
import type { BaselineKey } from "../../../../lib/skills/catalog";
export type { BaselineKey };
export const baselineProblems = ["none", "execution_mismatch", "execution_missing", "execution_failed",
  "execution_timed_out", "execution_cancelled", "execution_output_limit", "execution_cleanup_pending",
  "execution_policy_rejected", "execution_spawn_failed", "execution_helper_failed", "runner_busy",
  "output_unsupported", "clock_uncertain", "boot_uncertain", "snapshot_changed", "evidence_inconsistent"] as const;
export const baselineReasons = [...baselineProblems.filter((p) => p !== "none"),
  "package_changes", "package_removals", "package_cache_unverified", "package_plan_clear", "reboot_marker_present", "reboot_marker_absent",
  "reboot_assurance_unverified", "fstrim_unit_unavailable", "fstrim_timer_disabled", "fstrim_timer_failed",
  "fstrim_timer_inactive", "fstrim_condition_skipped", "fstrim_history_unavailable", "fstrim_running",
  "fstrim_service_failed", "fstrim_schedule_unverified", "fstrim_condition_unverified",
  "fstrim_trigger_unconfirmed", "fstrim_observed_success", "fstrim_context_unavailable", "fstrim_scheduled",
  "fstrim_awaiting_result", "fstrim_result_overdue", "unsupported_observation"] as const;
export const maxEpoch = 253402300799;
export type Execution = { step_id: string; profile: string; outcome: string; exit_code: number | null;
  signal: number | null; stdout_truncated: boolean; stderr_truncated: boolean; cleanup_complete: boolean };
export type PackageEvidence = { mode: "upgrade" | "with-new-pkgs"; upgraded: number; installed: number;
  removed: number; held_back: number; index_freshness: "unverified"; state_consistency: "unverified" };
export type RebootEvidence = { marker_observed: boolean; assurance: "unverified" };
export type Condition = { passed: boolean | null; checked_at: number | null };
export type TimerEvidence = { load_state: string; active_state: string; unit_file_state: string;
  last_trigger: number | null; next_elapse: number | null; condition: Condition };
export type ServiceEvidence = { load_state: string; active_state: string; result: string; exit_kind: number;
  exit_status: number; started_at: number | null; finished_at: number | null; condition: Condition };
export type FstrimEvidence = { timer: TimerEvidence; service: ServiceEvidence;
  observed_at: number; reclamation_verified: false };
export type BaselineObservation = { schema_version: 1; key: BaselineKey; normalizer: string; problem: string;
  execution: Execution[]; packages: PackageEvidence | null; reboot: RebootEvidence | null; fstrim: FstrimEvidence | null };
export type Assessment = { state: "healthy" | "warning" | "unknown"; reason: string;
  incomplete: boolean; informational: boolean };
