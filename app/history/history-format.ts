import { locale, messages } from "@/i18n/messages";
import { m, percentLabel, text, time, type EventView } from "@/components/operator/format";
import type { HistoryFacts } from "@/server/history/types";
export const h = messages.history;
const day = new Intl.DateTimeFormat("en-CA", { timeZone: m.timezone, year: "numeric", month: "2-digit", day: "2-digit" });
const date = new Intl.DateTimeFormat(locale, { timeZone: m.timezone, day: "numeric", month: "short", year: "numeric" });
export function dayKey(value: string) { return day.format(new Date(value)); }
export function dayLabel(value: string, asOf: string) {
  const key = dayKey(value), today = dayKey(asOf);
  const yesterday = new Date(today + "T12:00:00Z"); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return key === today ? h.today : key === yesterday.toISOString().slice(0, 10) ? h.yesterday : date.format(new Date(value));
}
export function historyRange(start: string, end: string) {
  const first = dayKey(start), last = dayKey(end);
  const format = new Intl.DateTimeFormat(locale, { timeZone: m.timezone, day: "numeric", month: "short",
    ...(first.slice(0, 4) !== last.slice(0, 4) ? { year: "numeric" as const } : {}) });
  return first === last ? format.format(new Date(start)) : text(h.range, { start: format.format(new Date(start)), end: format.format(new Date(end)) });
}
export function observedAge(value: string, asOf: string) {
  const minutes = Math.max(0, Math.floor((Date.parse(asOf) - Date.parse(value)) / 60000));
  const unit = minutes >= 1440 ? "day" : minutes >= 60 ? "hour" : "minute";
  const n = unit === "day" ? Math.floor(minutes / 1440) : unit === "hour" ? Math.floor(minutes / 60) : minutes;
  return new Intl.RelativeTimeFormat(locale, { style: "short", numeric: "auto" }).format(-n, unit);
}
export function eventReason(event: EventView) {
  if (event.after_facts?.package) return event.after_facts.package.reason;
  if (event.kind === "gap") return m.gapNote;
  if (event.kind === "context") return event.to_reason === "skill_disabled" ? messages.skills.disabledContext :
    event.to_reason === "enablement_changed" || event.previous_scope && typeof event.previous_scope === "object" &&
      "enablement_version" in event.previous_scope && String(event.previous_scope.enablement_version) !== String(event.enablement_version)
      ? messages.skills.resumedContext : m.contextNote;
  if (event.subject_key === "disk-local" && event.after_facts?.disk)
    return m.factDisk.replace("{path}", event.after_facts.disk.path).replace("{percent}", percentLabel(event.after_facts.disk));
  if (event.after_facts?.packages) return text(m.factPackages, event.after_facts.packages);
  if (event.after_facts?.marker_observed !== undefined) return event.after_facts.marker_observed ? m.requested : m.noMarker;
  if (event.after_facts?.trim?.last_observed_result !== undefined) {
    const t = event.after_facts.trim;
    return text(m.factTrimObserved, { result: t.last_observed_result ? m.trimResults[t.last_observed_result] : m.trimPending,
      expected: t.expected_at ? time(new Date(t.expected_at * 1000).toISOString(), true) : h.unavailable });
  }
  return (messages.baseline.reasons as Record<string, string>)[event.to_reason] ??
    (messages.baseline.currentReasons as Record<string, string>)[event.to_reason] ??
    (messages.disk.reason as Record<string, string>)[event.to_reason] ??
    (m.contactReasons as Record<string, string>)[event.to_reason] ?? m.unavailableReason;
}
function values(f: HistoryFacts | null): Record<string, string> {
  if (!f) return {};
  const v: Record<string, string> = {};
  if (f.disk) {
    v.path = f.disk.path; v.used = percentLabel(f.disk);
    const bytes = (value: string) => {
      const n = BigInt(value), unit = n >= 1000000000n ? "gigabyte" : n >= 1000000n ? "megabyte" : n >= 1000n ? "kilobyte" : "byte";
      const divisor = unit === "gigabyte" ? 1e9 : unit === "megabyte" ? 1e6 : unit === "kilobyte" ? 1000 : 1;
      return new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "short", maximumFractionDigits: 1 }).format(Number(n) / divisor);
    };
    v.available = bytes(f.disk.available_bytes); v.totalBytes = bytes(f.disk.total_bytes);
  }
  if (f.packages) for (const [k, n] of Object.entries(f.packages)) v[k] = new Intl.NumberFormat(locale).format(n);
  if (f.marker_observed !== undefined) v.marker = f.marker_observed ? m.requested : m.noMarker;
  if (f.contact_at) v.contact = time(f.contact_at, true);
  if (f.measured_at) v.measurement = time(f.measured_at, true);
  if (f.trim) {
    const t = f.trim, enums = h.enum as Record<string, string>;
    v.timer = enums[t.timer_state] ?? t.timer_state; v.service = enums[t.service_state] ?? t.service_state;
    v.result = t.last_observed_result === undefined ? enums[t.result] ?? t.result : t.last_observed_result ? enums[t.last_observed_result]! : m.trimPending;
    for (const [key, val] of [["observed", t.last_observed_at ?? t.finished_at], ["scheduled", t.next_scheduled_at], ["expected", t.expected_at]] as const)
      if (val) v[key] = time(new Date(val * 1000).toISOString(), true);
  }
  return v;
}
export function comparisons(event: EventView) {
  const before: Record<string, string> = { state: event.from_state ? m.states[event.from_state] : m.noPrevious, ...values(event.before_facts) };
  const after: Record<string, string> = { state: m.states[event.to_state], ...values(event.after_facts) };
  if (event.kind === "context") {
    const prior = event.previous_scope && typeof event.previous_scope === "object" && !Array.isArray(event.previous_scope)
      ? event.previous_scope as Record<string, unknown> : {};
    for (const [label, key, current] of [["source", "source_revision", event.source_revision],
      ["policy", "policy_version", event.policy_version], ["assessment", "assessment_version", event.assessment_version],
      ["generation", "generation", event.generation]] as const) {
      before[label] = typeof prior[key] === "string" || typeof prior[key] === "number" ? String(prior[key]) : h.unavailable;
      after[label] = current === null ? h.unavailable : String(current);
    }
  }
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].map((key) => {
    const b = (before as Record<string, string>)[key] ?? h.unavailable, a = (after as Record<string, string>)[key] ?? h.unavailable;
    return { key, label: (h as unknown as Record<string, string>)[key] ?? (h.packages as Record<string, string>)[key] ?? key,
      before: b, after: a, changed: Object.hasOwn(before, key) && Object.hasOwn(after, key) && (key !== "state" || event.from_state !== null) && b !== a };
  });
}
