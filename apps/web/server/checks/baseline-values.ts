import { baselineKeys, baselineProblems, maxEpoch, normalizers, type BaselineObservation,
  type BaselineKey } from "./baseline-types";

function object(value: unknown, fields: string): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = fields.split(" ");
  return Object.keys(value).length === keys.length && keys.every((k) => Object.hasOwn(value, k));
}
function member(value: unknown, choices: string): value is string {
  return typeof value === "string" && choices.split("|").includes(value);
}
function integer(value: unknown, max: number, min = 0): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}
function timestamp(value: unknown): boolean { return value === null || integer(value, maxEpoch, 1); }
function condition(value: unknown): boolean {
  return object(value, "passed checked_at") && timestamp(value.checked_at) &&
    (value.checked_at === null ? value.passed === null : typeof value.passed === "boolean");
}
function states(value: Record<string, unknown>): boolean {
  return member(value.load_state, "loaded|not-found|error|bad-setting|masked|merged|stub") &&
    member(value.active_state, "active|reloading|inactive|failed|activating|deactivating|refreshing|maintenance");
}
function packages(value: unknown): boolean {
  if (!object(value, "mode upgraded installed removed held_back index_freshness state_consistency")) return false;
  return member(value.mode, "upgrade|with-new-pkgs") && value.index_freshness === "unverified" &&
    value.state_consistency === "unverified" &&
    [value.upgraded, value.installed, value.removed, value.held_back].every((v) => integer(v, 1_000_000)) &&
    Number(value.upgraded) + Number(value.installed) + Number(value.removed) + Number(value.held_back) <= 1_000_000;
}
function fstrim(value: unknown): boolean {
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
function execution(value: unknown, key: BaselineKey): boolean {
  if (!Array.isArray(value)) return false;
  const steps = key === "fstrim-status" ? [["timer", "fstrim-timer.v1"], ["service", "fstrim-service.v1"]] as const
    : key === "package-updates" ? [["apt", "apt-upgrade.v1"]] as const : [["marker", "reboot-marker.v1"]] as const;
  return value.length <= steps.length && value.every((v, i) =>
    object(v, "step_id profile outcome exit_code signal stdout_truncated stderr_truncated cleanup_complete") &&
    v.step_id === steps[i]?.[0] && v.profile === steps[i]?.[1] &&
    member(v.outcome, "exited|policy_rejected|spawn_failed|timed_out|cancelled|output_limit|helper_failed|cleanup_pending|runner_busy") &&
    (v.exit_code === null || integer(v.exit_code, 255)) && (v.signal === null || integer(v.signal, 64, 1)) &&
    !(v.signal !== null && v.exit_code !== null) && typeof v.stdout_truncated === "boolean" &&
    typeof v.stderr_truncated === "boolean" && typeof v.cleanup_complete === "boolean");
}

// Accept only this versioned, bounded typed shape. Raw stdout/stderr, arbitrary
// properties, new versions and purported cache/reclamation assurance are rejected.
export function parseBaselineObservation(value: unknown): BaselineObservation | null {
  if (!object(value, "schema_version key normalizer problem execution packages reboot fstrim") ||
    value.schema_version !== 1 || !member(value.key, baselineKeys.join("|")) ||
    value.normalizer !== normalizers[value.key as BaselineKey] || !member(value.problem, baselineProblems.join("|")) ||
    !execution(value.execution, value.key as BaselineKey)) return null;
  const key = value.key as BaselineKey;
  if (value.problem !== "none") {
    return value.packages === null && value.reboot === null && value.fstrim === null ? value as BaselineObservation : null;
  }
  const steps = value.execution as BaselineObservation["execution"];
  if (steps.length !== (key === "fstrim-status" ? 2 : 1) || steps.some((s) => s.outcome !== "exited" ||
    s.signal !== null || s.exit_code === null || !s.cleanup_complete || s.stdout_truncated || s.stderr_truncated ||
    s.exit_code !== 0 && !(key === "reboot-required" && s.exit_code === 1))) return null;
  const valid = key === "package-updates" ? packages(value.packages) && value.reboot === null && value.fstrim === null
    : key === "reboot-required" ? object(value.reboot, "marker_observed assurance") &&
      typeof value.reboot.marker_observed === "boolean" && value.reboot.assurance === "unverified" &&
      value.reboot.marker_observed === (steps[0]!.exit_code === 0) && value.packages === null && value.fstrim === null
      : fstrim(value.fstrim) && value.packages === null && value.reboot === null;
  return valid ? value as BaselineObservation : null;
}
