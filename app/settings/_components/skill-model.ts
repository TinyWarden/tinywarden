import { messages, locale } from "@/i18n/messages";
import { instant } from "@/components/operator/read-validation";
import { displayKeys, findSkill, skillKeys, type SkillKey } from "@/lib/skills/catalog";
export type { SkillKey };
export const order = displayKeys;
import type { SkillView } from "@/lib/skills/types";
export type { SkillViewEntry as Skill, SkillView, DraftReport, SkillEditorProps } from "@/lib/skills/types";
export const t = messages.skills;
export const category = (key: SkillKey) => t[findSkill(key)!.category];
export function cadence(seconds: number | string) {
  const n = Number(seconds);
  return new Intl.NumberFormat(locale, { style: "unit", unit: n % 3600 === 0 ? "hour" : n % 60 === 0 ? "minute" : "second", unitDisplay: "short" })
    .format(n % 3600 === 0 ? n / 3600 : n % 60 === 0 ? n / 60 : n);
}
export function validSkills(v: unknown): v is SkillView {
  if (!v || typeof v !== "object") return false;
  const r = v as SkillView;
  return r.schema_version === 1 && instant(r.as_of) && Array.isArray(r.skills) && r.skills.length === skillKeys.length &&
    new Set(r.skills.map((s) => s.key)).size === skillKeys.length && r.skills.every((s) => order.includes(s.key) &&
      typeof s.enabled === "boolean" && Number.isSafeInteger(s.revision) && s.revision > 0 &&
      Number.isSafeInteger(s.enablement_version) && s.enablement_version > 0 && instant(s.saved_at) && instant(s.enablement_changed_at) &&
      !!s.values && Number.isSafeInteger(s.values.interval_seconds) && s.values.interval_seconds >= 60);
}
