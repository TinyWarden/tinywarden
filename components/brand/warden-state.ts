import type { FleetView } from "../operator/format";

export type WardenState = "critical" | "warning" | "unknown" | "healthy";
export const visorColors: Record<WardenState, string> = {
  critical: "#ff5a47", warning: "#ffb020", unknown: "#8e88a3", healthy: "#d8ff3f",
};
export function fleetWardenState(view: FleetView | null, outdated: boolean): WardenState {
  const counts = view?.counts;
  if (!counts || outdated || !counts.total) return "unknown";
  return counts.critical > 0 ? "critical" : counts.warning > 0 ? "warning"
    : counts.unknown > 0 ? "unknown" : "healthy";
}
