import { skillKeys, type SkillKey } from "@/lib/skills/catalog";
import { instant } from "@/components/operator/read-validation";
export type Field = "warning_percent" | "critical_percent" | "interval_seconds" | "timeout_seconds" | "package_mode";
export type Values = Partial<Record<Field, number | string>> & { interval_seconds: number };
export type Policy = { as_of?: string; schema_version: 2; host_id: string; definition_key: SkillKey; current_default_revision: number;
  policy_version: number; mode: "inherit" | "override"; overrides: Partial<Values>; default_values: Values; effective_values: Values;
  latest_delivered_revision: number | null; latest_delivered_values: Values | null; applicability: string };
export const skillOrder = skillKeys;
export function fields(key: SkillKey): Field[] { return key === "disk-local" ? ["warning_percent", "critical_percent", "interval_seconds"]
  : key === "package-updates" ? ["interval_seconds", "timeout_seconds", "package_mode"] : ["interval_seconds", "timeout_seconds"]; }
export function policyPath(host: string, key: SkillKey) { return `/api/v1/operator/hosts/${host}/${key === "disk-local" ? "checks" : "baselines"}/${key}`; }
export function validValues(v: unknown, key: SkillKey): v is Values {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as Values, n = (f: Field, min: number, max: number) => typeof r[f] === "number" && Number.isSafeInteger(r[f]) && Number(r[f]) >= min && Number(r[f]) <= max;
  return key === "disk-local" ? n("warning_percent", 1, 99) && n("critical_percent", 2, 100) && Number(r.warning_percent) < Number(r.critical_percent) && n("interval_seconds", 60, 3600)
    : n("interval_seconds", 300, 86400) && n("timeout_seconds", 1, 30) && (r.package_mode === "upgrade" || key === "package-updates" && r.package_mode === "with-new-pkgs");
}
export function validPolicy(v: unknown): v is Policy {
  if (!v || typeof v !== "object") return false;
  const r = v as Policy;
  return r.schema_version === 2 && skillOrder.includes(r.definition_key) && typeof r.host_id === "string" &&
    Number.isSafeInteger(r.current_default_revision) && r.current_default_revision > 0 && Number.isSafeInteger(r.policy_version) && r.policy_version >= 0 &&
    validValues(r.default_values, r.definition_key) && validValues(r.effective_values, r.definition_key) &&
    !!r.overrides && typeof r.overrides === "object" && !Array.isArray(r.overrides) && Object.keys(r.overrides).every((k) => fields(r.definition_key).includes(k as Field)) &&
    (r.mode === "inherit" ? Object.keys(r.overrides).length === 0 : r.mode === "override" && Object.keys(r.overrides).length > 0) &&
    Object.entries(r.overrides).every(([k,v]) => r.effective_values[k as Field] === v) &&
    (r.latest_delivered_revision === null || Number.isSafeInteger(r.latest_delivered_revision) && r.latest_delivered_revision > 0) &&
    (r.latest_delivered_values === null || validValues(r.latest_delivered_values, r.definition_key)) && typeof r.applicability === "string";
}
export function validTiming(v: unknown): v is { as_of: string; valid_until?: string | null } {
  return !!v && typeof v === "object" && instant((v as { as_of?: unknown }).as_of);
}
export function draftOf(p: Policy): Partial<Record<Field, string>> { return Object.fromEntries(Object.entries(p.overrides).map(([k,v]) => [k, String(v)])); }
export function draftOverrides(d: Partial<Record<Field, string>>, p: Policy): Partial<Values> | null {
  const parsed = Object.fromEntries(Object.entries(d).map(([k,v]) => [k, k === "package_mode" ? v : /^(0|[1-9][0-9]*)$/.test(v) ? Number(v) : NaN]));
  return validValues({ ...p.default_values, ...parsed }, p.definition_key) ? parsed : null;
}
export function draftDirty(d: Partial<Record<Field, string>>, p: Policy) { return JSON.stringify(Object.entries(d).sort()) !== JSON.stringify(Object.entries(draftOf(p)).sort()); }
