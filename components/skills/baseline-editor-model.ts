import type { BaselineKey } from "@/lib/skills/catalog";
import type { BaselineValues } from "@/lib/skills/types";
import { messages } from "@/i18n/messages";

type Global = BaselineValues & { schema_version: 1; definition_key: BaselineKey; revision: number };
type Host = { schema_version: 1; definition_key: BaselineKey; current_default_revision: number;
  default_values: BaselineValues; effective_values: BaselineValues; override_values: BaselineValues | null;
  policy_version: number; mode: "inherit" | "override"; pinned_definition_revision: number | null;
  latest_delivered_revision: number | null; latest_delivered_values: BaselineValues | null; applicability: string };
export type SavedBaseline = Global | Host;
export type BaselineDraft = { mode: "inherit" | "override"; interval: string; timeout: string; packageMode: BaselineValues["package_mode"] };
export const isHostBaseline = (s: SavedBaseline): s is Host => "policy_version" in s;
const safe = (v: unknown, minimum: number) => typeof v === "number" && Number.isSafeInteger(v) && v >= minimum;
function validValues(v: unknown, key: BaselineKey): v is BaselineValues {
  if (!v || typeof v !== "object") return false;
  const row = v as Record<string, unknown>;
  return safe(row.interval_seconds, 300) && Number(row.interval_seconds) <= 86400 && safe(row.timeout_seconds, 1) && Number(row.timeout_seconds) <= 30 &&
    (row.package_mode === "upgrade" || key === "package-updates" && row.package_mode === "with-new-pkgs");
}
export function validSavedBaseline(v: unknown, key: BaselineKey, host: boolean): v is SavedBaseline {
  if (!v || typeof v !== "object") return false;
  const row = v as Record<string, unknown>;
  if (row.schema_version !== 1 || row.definition_key !== key) return false;
  if (!host) return safe(row.revision, 1) && validValues(row, key);
  return safe(row.current_default_revision, 1) && safe(row.policy_version, 0) && validValues(row.default_values, key) && validValues(row.effective_values, key) &&
    (row.mode === "inherit" && row.override_values === null || row.mode === "override" && validValues(row.override_values, key)) &&
    (row.mode === "inherit" && row.pinned_definition_revision === null || row.mode === "override" && safe(row.pinned_definition_revision, 1)) &&
    (row.latest_delivered_revision === null || safe(row.latest_delivered_revision, 1)) &&
    (row.latest_delivered_values === null || validValues(row.latest_delivered_values, key)) && typeof row.applicability === "string";
}
export function baselineDraft(s: SavedBaseline): BaselineDraft {
  const v = isHostBaseline(s) ? s.override_values ?? s.effective_values : s;
  return { mode: isHostBaseline(s) ? s.mode : "override", interval: String(v.interval_seconds), timeout: String(v.timeout_seconds), packageMode: v.package_mode };
}
export function baselineDirty(d: BaselineDraft, s: SavedBaseline): boolean {
  const original = baselineDraft(s);
  return d.mode !== original.mode || d.mode === "override" && (d.interval !== original.interval || d.timeout !== original.timeout || d.packageMode !== original.packageMode);
}
export function baselineDraftValues(d: BaselineDraft, key: BaselineKey): BaselineValues | null {
  const v = { interval_seconds: Number(d.interval), timeout_seconds: Number(d.timeout), package_mode: d.packageMode };
  return /^[1-9][0-9]*$/.test(d.interval) && /^[1-9][0-9]*$/.test(d.timeout) && validValues(v, key) ? v : null;
}
export function baselineValuesLabel(v: BaselineValues): string {
  return messages.baseline.editing.valuesFormat.replace("{interval}", String(v.interval_seconds))
    .replace("{timeout}", String(v.timeout_seconds)).replace("{mode}", messages.baseline.editing[v.package_mode]);
}
