import type { BaselineObservation, Assessment } from "../shared/types";
import { evaluateTrim } from "./legacy-assessment";
import { assessFstrim } from "./assessment";

export function assessTrim(observation: BaselineObservation, version: number, context: unknown, at?: Date): Assessment {
  const e = observation.fstrim!;
  return version === 3 ? assessFstrim(e, context, at ?? new Date(e.observed_at * 1000)) : evaluateTrim(e);
}
