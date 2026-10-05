import { locale, messages } from "@/i18n/messages";
import type { DashboardView } from "@/server/fleet/dashboard";
import type { HistoryView } from "@/server/history/reads";

export type Wire<T> = T extends Date ? string : T extends (infer V)[] ? Wire<V>[] : T extends object ? { [K in keyof T]: Wire<T[K]> } : T;
export type FleetView = Wire<DashboardView> & { schema_version: 1 };
export type FleetHost = FleetView["groups"]["attention"]["hosts"][number];
export type EventView = Wire<HistoryView>["events"][number];
export type ChangeView = Wire<HistoryView> & { schema_version: 1 };
export const m = messages.dashboard;
export function skillName(key: string, name?: string | null) {
  return name ?? (m.checkNames as Record<string, string>)[key] ?? key;
}
const zone = { timeZone: m.timezone };
const clock = new Intl.DateTimeFormat(locale, { ...zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const date = new Intl.DateTimeFormat(locale, { ...zone, dateStyle: "medium", timeStyle: "short" });
const header = new Intl.DateTimeFormat(locale, { ...zone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function text(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
}
export function time(value: string | null, full = false) {
  return value ? (full ? date : clock).format(new Date(value)) : messages.fleet.never;
}
export function headerTime(value: string) { return header.format(new Date(value)) + m.separator + m.timezone; }
export function percent(disk: { total_bytes: string; available_bytes: string }) {
  const total = BigInt(disk.total_bytes), available = BigInt(disk.available_bytes);
  return Number((total - available) * 1000n / total) / 10;
}
export function percentLabel(disk: { total_bytes: string; available_bytes: string }) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(percent(disk)) + m.percent;
}
export function reason(host: FleetHost) {
  if (host.primary_key === "contact") return (m.contactReasons as Record<string, string>)[host.contact_state] ?? m.unavailableReason;
  const primary = host.checks.find((c) => c.key === host.primary_key);
  if (primary && "reason_text" in primary && primary.reason === "skill_assessment") return primary.reason_text;
  if (host.primary_key === "disk-local" && host.worst_disk)
    return text(m.diskReason, { path: host.worst_disk.path, percent: percentLabel(host.worst_disk) });
  const key = host.primary_reason ?? "";
  return (messages.baseline.reasons as Record<string, string>)[key] ??
    (messages.baseline.currentReasons as Record<string, string>)[key] ??
    (messages.disk.reason as Record<string, string>)[key] ?? m.unavailableReason;
}
