import { object } from "../shared/json";

export function validReboot(value: unknown): boolean {
  return object(value, "marker_observed assurance") && typeof value.marker_observed === "boolean" &&
    value.assurance === "unverified";
}
