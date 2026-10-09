import type { Summary } from "./types";
import type { InlineFragment } from "../../lib/skills/notification-types";
import { resolveDetails, validFragments } from "../../lib/skills/notification-details";
import messages from "../../messages/en.json";

export interface MessageSnapshot {
  format: 1; kind: "contact" | "skill"; host_label: string; skill_name: string | null;
  locale: "en"; time_zone: string; captured_at: string; reading_at: string | null; contact_at: string | null;
  evidence: { observation_id: string; content_sha256: string; assessment_from: number } | null;
  details: InlineFragment[] | null;
}
const controls = /[\p{Cc}\u2028\u2029\u061c\u200e\u200f\u202a-\u202e\u2066-\u206f]/gu;
export function safeIdentity(text: string, limit: number) { return [...text.replace(controls, "")].slice(0, limit).join(""); }
function instant(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function timeZone(value: string) { try { return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone; } catch { return "UTC"; } }
export function messageSnapshot(summary: Summary, label: string): MessageSnapshot {
  const contact = summary.key === "contact", measured = summary.measured_at;
  const id = summary.facts?.package?.observation_id;
  return { format: 1, kind: contact ? "contact" : "skill", host_label: safeIdentity(label, 128),
    skill_name: contact ? null : safeIdentity(summary.name ?? messages.notifications.checks[summary.key as keyof typeof messages.notifications.checks] ?? summary.key, 200),
    locale: "en", time_zone: timeZone(Intl.DateTimeFormat().resolvedOptions().timeZone), captured_at: summary.as_of,
    reading_at: instant(measured) ? measured : null,
    contact_at: contact && instant(summary.facts?.contact_at) ? summary.facts.contact_at : null,
    evidence: id && summary.content_sha256 && summary.assessment ? { observation_id: id,
      content_sha256: summary.content_sha256, assessment_from: summary.assessment.from } : null,
    details: !contact && summary.metadata && summary.assessment && summary.settings
      ? resolveDetails(summary.metadata, summary.assessment, summary.settings, messages.notificationV2.booleans) : null };
}
export function readSnapshot(value: unknown, key: string, at: Date): MessageSnapshot | null {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const s = value as MessageSnapshot;
    if (Object.keys(s).sort().join(",") !== "captured_at,contact_at,details,evidence,format,host_label,kind,locale,reading_at,skill_name,time_zone" ||
      s.format !== 1 || s.kind !== (key === "contact" ? "contact" : "skill") || s.locale !== "en" ||
      typeof s.host_label !== "string" || s.host_label !== safeIdentity(s.host_label, 128) ||
      (s.kind === "contact" ? s.skill_name !== null : typeof s.skill_name !== "string" || s.skill_name !== safeIdentity(s.skill_name, 200)) ||
      !instant(s.captured_at) || Date.parse(s.captured_at) !== at.getTime() ||
      (s.reading_at !== null && (!instant(s.reading_at) || Date.parse(s.reading_at) > at.getTime())) ||
      (s.contact_at !== null && (!instant(s.contact_at) || Date.parse(s.contact_at) > at.getTime())) ||
      typeof s.time_zone !== "string" || timeZone(s.time_zone) !== s.time_zone ||
      (s.details !== null && !validFragments(s.details)) || Buffer.byteLength(JSON.stringify(s)) > 8192) return null;
    if (s.evidence !== null && (Object.keys(s.evidence).sort().join(",") !== "assessment_from,content_sha256,observation_id" ||
      !/^[0-9a-f-]{36}$/.test(s.evidence.observation_id) || !/^[0-9a-f]{64}$/.test(s.evidence.content_sha256) ||
      !Number.isSafeInteger(s.evidence.assessment_from) || s.evidence.assessment_from > at.getTime())) return null;
    return s;
  } catch { return null; }
}
