import { evaluators, type Assessment } from "./types";
import { parseBaselineObservation } from "./observation";
import { baselineAdapters } from "./registry";
import { assessment } from "./assessment-result";

// Immutable interpretation versions are owned by the compiled skill adapters.
export function evaluateBaseline(value: unknown, evaluator: string, version = 1,
  context: unknown = null, at?: Date): Assessment {
  const observation = parseBaselineObservation(value);
  if (!observation || evaluator !== evaluators[observation.key]) return assessment("unknown", "unsupported_observation");
  if (observation.problem !== "none") return assessment("unknown", observation.problem);
  return baselineAdapters[observation.key].assess(observation, version, context, at);
}
