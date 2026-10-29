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
const logClock = new Intl.DateTimeFormat(locale, { ...zone, hour: "2-digit", minute: "2-digit", second:"2-digit", hourCycle: "h23" });
const date = new Intl.DateTimeFormat(locale, { ...zone, dateStyle: "medium", timeStyle: "short" });
const year = new Intl.DateTimeFormat(locale, { ...zone, year: "numeric" });
const compactDate = new Intl.DateTimeFormat(locale, { ...zone, month: "short", day: "numeric" });
const datedYear = new Intl.DateTimeFormat(locale, { ...zone, month: "short", day: "numeric", year: "numeric" });
const preciseDate = new Intl.DateTimeFormat(locale, { ...zone, month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" });
const header = new Intl.DateTimeFormat(locale, { ...zone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function text(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
}
export function time(value: string | null, full = false) {
  return value ? (full ? date : clock).format(new Date(value)) : messages.fleet.never;
}
export function operationLogTime(value:string){return logClock.format(new Date(value));}
export function compactDashboardTime(value: number, asOf: string) {
  const at = new Date(value), sameYear = year.format(at) === year.format(new Date(asOf));
  return { label: (sameYear ? compactDate : datedYear).format(at) + m.separator + clock.format(at), full: preciseDate.format(at), dateTime: at.toISOString() };
}
export function headerTime(value: string) { return header.format(new Date(value)) + m.separator + m.timezoneLabel; }
export function headerTimeParts(value: string) { return header.formatToParts(new Date(value)); }
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
  return primary?.reason_text ?? m.unavailableReason;
}
