import { evaluateBaseline } from "./evaluation";
import type { Assessment } from "./types";

export const currentAssessmentVersion = 3;

export function assessBaseline(value: unknown, evaluator: string, version: number, context: unknown = null, at?: Date): Assessment {
  if (version !== 1 && version !== 2 && version !== 3) return { state: "unknown", reason: "unsupported_observation",
    incomplete: true, informational: false };
  return evaluateBaseline(value, evaluator, version, context, at);
}
