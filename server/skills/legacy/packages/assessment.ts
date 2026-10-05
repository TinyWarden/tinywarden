import type { BaselineObservation, Assessment } from "../shared/types";
import { assessment } from "../shared/assessment-result";

export function assessPackages(observation: BaselineObservation, version: number): Assessment {
  const p = observation.packages!;
  if (p.removed > 0) return assessment("warning", "package_removals");
  if (p.upgraded + p.installed + p.held_back > 0) return assessment("warning", "package_changes");
  return version === 1 ? assessment("unknown", "package_cache_unverified", true, true)
    : assessment("healthy", "package_plan_clear", true, true);
}
