import { fail } from "../../../errors";
import { exactObject } from "../../../validation";
import { baselineKeys, normalizers, evaluators, type BaselineKey } from "./types";
import { findSkill } from "../../../../lib/skills/catalog";
import { baselineAdapters } from "./registry";

export const baselineCapability = "exec_observe.debian13.v1";
import type { BaselineValues } from "../../../../lib/skills/types";
export type { BaselineValues };
export type Recipe = { schema_version: 1; capability: typeof baselineCapability; policy_version: 1;
  timeout_seconds: number; steps: { step_id: string; profile: string; argv: string[] }[] };

export function baselineKey(value: unknown): BaselineKey {
  if (typeof value !== "string" || !baselineKeys.includes(value as BaselineKey)) fail("not_found", 404);
  return value as BaselineKey;
}
export function boundedInteger(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) fail("invalid_request", 400);
  return value;
}
export function baselineValues(key: BaselineKey, raw: Record<string, unknown>): BaselineValues {
  const mode = raw.package_mode, definition = findSkill(key);
  if (mode !== "upgrade" && !(definition?.family === "baseline" && definition.selectablePackageMode &&
    mode === "with-new-pkgs")) fail("invalid_request", 400);
  return { interval_seconds: boundedInteger(raw.interval_seconds, 300, 86400),
    timeout_seconds: boundedInteger(raw.timeout_seconds, 1, 30), package_mode: mode };
}
export function makeBaselineRecipe(key: BaselineKey, values: BaselineValues): Recipe {
  const steps = baselineAdapters[key].steps(values);
  return { schema_version: 1, capability: baselineCapability, policy_version: 1, timeout_seconds: values.timeout_seconds, steps };
}
export function parseBaselineRecipe(key: BaselineKey, value: unknown): Recipe {
  const r = exactObject(value, ["schema_version", "capability", "policy_version", "timeout_seconds", "steps"]);
  if (r.schema_version !== 1 || r.policy_version !== 1 || r.capability !== baselineCapability ||
    !Array.isArray(r.steps) || Buffer.byteLength(JSON.stringify(value)) > 8192) fail("invalid_request", 400);
  const timeout = boundedInteger(r.timeout_seconds, 1, 30);
  const steps = r.steps.map((v) => {
    const s = exactObject(v, ["step_id", "profile", "argv"]);
    if (typeof s.step_id !== "string" || typeof s.profile !== "string" || !Array.isArray(s.argv) ||
      !s.argv.every((a) => typeof a === "string")) fail("invalid_request", 400);
    return { step_id: s.step_id, profile: s.profile, argv: s.argv as string[] };
  });
  const mode = key === "package-updates" && steps[0]?.argv.length === 3 ? "with-new-pkgs" : "upgrade";
  const expected = makeBaselineRecipe(key, { timeout_seconds: timeout, interval_seconds: 3600, package_mode: mode });
  if (JSON.stringify(steps) !== JSON.stringify(expected.steps)) fail("invalid_request", 400);
  return expected;
}
export function checkedBaselineSource(key: BaselineKey, row: { recipe: unknown; normalizer: string;
  evaluator: string; interval_seconds: number; timeout_seconds: number; package_mode: string }) {
  const values = baselineValues(key, row);
  const recipe = parseBaselineRecipe(key, row.recipe);
  if (row.normalizer !== normalizers[key] || row.evaluator !== evaluators[key] ||
    JSON.stringify(recipe) !== JSON.stringify(makeBaselineRecipe(key, values))) fail("temporarily_unavailable", 503);
  return { ...values, recipe, normalizer: row.normalizer, evaluator: row.evaluator };
}
