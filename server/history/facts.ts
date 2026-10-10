import type { HistoryFacts } from "./types";
import { uuid } from "../validation";
const instant = (value: unknown) => typeof value === "string" && Number.isFinite(new Date(value).getTime()) && new Date(value).toISOString() === value;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, names: string[]) => Object.keys(value).every((key) => names.includes(key));
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
// Legacy admitted metadata may exceed consumer budgets. Bound human text in
// UTF-8 without splitting a character; serialized facts stay below 8 KiB.
export function historyText(value: string, bytes: number): string {
  if (Buffer.byteLength(JSON.stringify(value))-2 <= bytes) return value;
  let result = "", used = 0;
  for (const char of value) {
    const size = Buffer.byteLength(JSON.stringify(char))-2;
    if (used + size > bytes - 3) break;
    result += char; used += size;
  }
  return result + "…";
}
export function safeHistoryFacts(value: unknown): HistoryFacts | null {
  try { return parseHistoryFacts(value); }
  catch { return null; }
}
export function parseHistoryFacts(value: unknown): HistoryFacts | null {
  if (value === null) return null;
  if (!object(value) || Buffer.byteLength(JSON.stringify(value)) > 8192 ||
    !exact(value, ["run_id", "measured_at", "contact_at", "disk", "packages", "marker_observed", "trim", "package"])) throw new Error("invalid_history_facts");
  if (value.package !== undefined) {
    const p = value.package;
    if (!object(p) || !exact(p, ["content_sha256", "name", "reason", "observation_id"]) ||
      typeof p.content_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(p.content_sha256) ||
      typeof p.name !== "string" || p.name.length > 2048 || typeof p.reason !== "string" || p.reason.length > 4096) throw new Error("invalid_history_facts");
    if (p.observation_id !== null) uuid(p.observation_id);
  }
  if (value.run_id !== undefined) uuid(value.run_id);
  for (const key of ["measured_at", "contact_at"]) if (value[key] !== undefined && !instant(value[key])) throw new Error("invalid_history_facts");
  if (value.marker_observed !== undefined && typeof value.marker_observed !== "boolean") throw new Error("invalid_history_facts");
  if (value.packages !== undefined && (!object(value.packages) ||
    !exact(value.packages, ["upgraded", "installed", "removed", "held_back"]) ||
    !["upgraded", "installed", "removed", "held_back"].every((key) => count((value.packages as Record<string, unknown>)[key])))) throw new Error("invalid_history_facts");
  if (value.disk !== undefined) {
    const d = value.disk;
    if (!object(d) || !exact(d, ["mount_id", "path", "total_bytes", "available_bytes", "classification", "shared_capacity", "coverage"]) ||
      !count(d.mount_id) || typeof d.path !== "string" || !d.path.startsWith("/") || d.path.length > 4096 ||
      typeof d.total_bytes !== "string" || !/^[1-9][0-9]{0,19}$/.test(d.total_bytes) ||
      typeof d.available_bytes !== "string" || !/^(0|[1-9][0-9]{0,19})$/.test(d.available_bytes) ||
      BigInt(d.available_bytes) > BigInt(d.total_bytes) || !["healthy", "warning", "critical"].includes(String(d.classification)) ||
      typeof d.shared_capacity !== "boolean" || !["complete", "incomplete"].includes(String(d.coverage))) throw new Error("invalid_history_facts");
  }
  if (value.trim !== undefined) {
    const t = value.trim;
    if (!object(t) || !exact(t, ["timer_state", "service_state", "result", "finished_at", "last_observed_result",
      "last_observed_at", "next_scheduled_at", "expected_at"]) ||
      !["timer_state", "service_state", "result"].every((key) => typeof t[key] === "string" && /^[a-z_-]{1,48}$/.test(t[key] as string)) ||
      !(t.finished_at === null || count(t.finished_at) && Number(t.finished_at) <= 253402300799)) throw new Error("invalid_history_facts");
    if (t.last_observed_result !== undefined && t.last_observed_result !== null &&
      !["success", "failure"].includes(String(t.last_observed_result)) ||
      ["last_observed_at", "next_scheduled_at", "expected_at"].some((key) =>
        t[key] !== undefined && t[key] !== null && !(count(t[key]) && Number(t[key]) <= 253402300799))) throw new Error("invalid_history_facts");
  }
  return value as HistoryFacts;
}
