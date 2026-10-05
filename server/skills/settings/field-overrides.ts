import { exactObject, versioned } from "../../validation";
import { fail } from "../../errors";

export const diskFields = ["critical_percent", "interval_seconds", "warning_percent"] as const;
export const baselineFields = (key: string) => key === "package-updates"
  ? ["interval_seconds", "package_mode", "timeout_seconds"] : ["interval_seconds", "timeout_seconds"];
export function hostPolicyBody(raw: unknown, oldFields: string[]): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("invalid_request", 400);
  const r = raw as Record<string, unknown>;
  if (r.schema_version === 2) return exactObject(raw, ["schema_version", "request_id", "expected_policy_version", "expected_default_revision", "overrides"]);
  return versioned(raw, ["request_id", "expected_policy_version", "expected_default_revision", "mode", ...(r.mode === "override" ? oldFields : [])]);
}
export function parseOverrides(raw: unknown, fields: readonly string[]): Record<string, number | string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("invalid_request", 400);
  const pairs = Object.entries(raw);
  if (pairs.some(([k, v]) => !fields.includes(k) || (typeof v !== "number" && typeof v !== "string"))) fail("invalid_request", 400);
  return Object.fromEntries(pairs.sort(([a], [b]) => a.localeCompare(b)));
}
export function savedOverrides<V extends object>(fields: readonly string[],
  policy: { mode: string; override_fields: string[] | null } | null, values: V | null): Partial<V> {
  if (!policy || policy.mode === "inherit") return {};
  const mask = policy.override_fields ?? fields;
  if (!values || mask.some((f) => !fields.includes(f))) fail("temporarily_unavailable", 503);
  return Object.fromEntries(mask.map((f) => [f, values[f as keyof V]])) as Partial<V>;
}
export function overridePairs(values: object) { return Object.entries(values).sort(([a], [b]) => a.localeCompare(b)); }
export function sameOverrides(a: object, b: object) { return JSON.stringify(overridePairs(a)) === JSON.stringify(overridePairs(b)); }
export function fullOverride(fields: readonly string[], policy: { mode: string; override_fields: string[] | null } | null) {
  return policy?.mode === "override" && (policy.override_fields === null || policy.override_fields.length === fields.length);
}
