import type { BaselineObservation, Assessment } from "../shared/types";
import { assessment } from "../shared/assessment-result";

export function assessReboot(observation: BaselineObservation, version: number): Assessment {
  if (observation.reboot!.marker_observed) return assessment("warning", "reboot_marker_present");
  return version === 1 ? assessment("unknown", "reboot_assurance_unverified", true, true)
    : assessment("healthy", "reboot_marker_absent", true, true);
}
