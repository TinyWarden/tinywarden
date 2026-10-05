import type { Assessment } from "./types";

export function assessment(state: Assessment["state"], reason: string, incomplete = true, informational = false): Assessment {
  return { state, reason, incomplete, informational };
}
