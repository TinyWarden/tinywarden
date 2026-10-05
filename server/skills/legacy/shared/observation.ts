import { baselineKeys, baselineProblems, normalizers, type BaselineObservation,
  type BaselineKey } from "./types";
import { object, member, integer } from "./json";
import { baselineAdapters } from "./registry";

function execution(value: unknown, key: BaselineKey): boolean {
  if (!Array.isArray(value)) return false;
  const steps = baselineAdapters[key].steps({ interval_seconds: 3600, timeout_seconds: 10, package_mode: "upgrade" });
  return value.length <= steps.length && value.every((v, i) =>
    object(v, "step_id profile outcome exit_code signal stdout_truncated stderr_truncated cleanup_complete") &&
    v.step_id === steps[i]?.step_id && v.profile === steps[i]?.profile &&
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
  const adapter = baselineAdapters[key];
  const valid = adapter.valid(value[adapter.field]) &&
    ["packages", "reboot", "fstrim"].every((field) => field === adapter.field || value[field] === null) &&
    (adapter.field !== "reboot" || (value.reboot as { marker_observed: boolean }).marker_observed === (steps[0]!.exit_code === 0));
  return valid ? value as BaselineObservation : null;
}
