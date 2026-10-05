import { skillKeys } from "@/lib/skills/catalog";
import { isPackageSkillId } from "@/lib/skills/package-types";
import type { FleetView, ChangeView } from "./format";
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const instant = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) &&
  Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const nullableTime = (v: unknown) => v === null || instant(v);
const cursor = (v: unknown) => v === null || typeof v === "string" && v.length <= 256 && /^[A-Za-z0-9_-]+$/.test(v);
const states = ["healthy", "warning", "critical", "unknown", "stale", "offline", "not_applicable", "disabled"];
const keys = ["contact", ...skillKeys];
const skillKey = (key: unknown) => keys.includes(String(key)) || isPackageSkillId(key);
const disk = (v: unknown) => v === null || object(v) && typeof v.path === "string" &&
  typeof v.total_bytes === "string" && /^[1-9][0-9]{0,19}$/.test(v.total_bytes) &&
  typeof v.available_bytes === "string" && /^(0|[1-9][0-9]{0,19})$/.test(v.available_bytes) && BigInt(v.available_bytes) <= BigInt(v.total_bytes);
function check(v: unknown) {
  return object(v) && skillKey(v.key) && states.includes(String(v.state)) && typeof v.reason === "string" &&
    nullableTime(v.valid_until) && (v.key === "contact" || object(v.facts) && (v.facts.measured_at === undefined || instant(v.facts.measured_at)));
}
function event(v: unknown) {
  return object(v) && typeof v.id === "string" && typeof v.host_id === "string" && typeof v.host_label === "string" &&
    instant(v.observed_at) && skillKey(v.subject_key) && ["state", "gap", "context"].includes(String(v.kind)) &&
    (v.from_state === null || states.includes(String(v.from_state))) && states.includes(String(v.to_state)) &&
    (v.before_facts === null || object(v.before_facts) && (v.before_facts.disk === undefined || disk(v.before_facts.disk))) &&
    (v.after_facts === null || object(v.after_facts) && (v.after_facts.disk === undefined || disk(v.after_facts.disk)));
}
export function validFleet(v: unknown): v is FleetView {
  if (!object(v) || v.schema_version !== 1 || !instant(v.as_of) || !nullableTime(v.valid_until) || !object(v.counts) || !object(v.groups)) return false;
  const c = v.counts;
  if (!["total", "attention", "critical", "warning", "unknown", "healthy"].every((key) => Number.isSafeInteger(c[key]) && Number(c[key]) >= 0) ||
    Number(c.total) !== Number(c.attention) + Number(c.unknown) + Number(c.healthy) || Number(c.attention) !== Number(c.critical) + Number(c.warning)) return false;
  for (const key of ["attention", "unknown", "healthy"]) {
    const group = v.groups[key];
    if (!object(group) || !Array.isArray(group.hosts) || group.hosts.length > 25 || !cursor(group.next_cursor) ||
      !group.hosts.every((h) => object(h) && typeof h.host_id === "string" && typeof h.label === "string" && h.group === key &&
        ["current", "stale", "unknown", "revoked"].includes(String(h.contact_state)) && check(h.contact_check) &&
        Array.isArray(h.checks) && h.checks.length >= 4 && h.checks.length <= 104 && h.checks.every(check) &&
        new Set(h.checks.map((c) => c.key)).size === h.checks.length && disk(h.worst_disk) && nullableTime(h.since) && nullableTime(h.last_contact_at))) return false;
  }
  const h = v.history;
  return h === null || object(h) && instant(h.since) && instant(h.next_midnight) && Number.isSafeInteger(h.count) && Number(h.count) >= 0 &&
    typeof h.lagging === "boolean" && Array.isArray(h.events) && h.events.length <= 5 && h.events.every(event);
}
export function validChanges(v: unknown): v is ChangeView {
  const totals = object(v) && object(v.filters) && object(v.filters.totals) ? v.filters.totals : {};
  return object(v) && v.schema_version === 1 && instant(v.as_of) && cursor(v.next_cursor) && Array.isArray(v.events) &&
    v.events.length <= 50 && v.events.every(event) && object(v.filters) &&
    Array.isArray(v.filters.servers) && v.filters.servers.length <= 100 && v.filters.servers.every((s) => object(s) &&
      typeof s.id === "string" && typeof s.label === "string" && Number.isSafeInteger(s.count) && Number(s.count) >= 0) &&
    Array.isArray(v.filters.skills) && v.filters.skills.length >= 5 && v.filters.skills.length <= 105 && v.filters.skills.every((s) => object(s) &&
      skillKey(s.key) && (s.label === undefined || s.label === null || typeof s.label === "string") && Number.isSafeInteger(s.count) && Number(s.count) >= 0) &&
    new Set(v.filters.skills.map((s) => s.key)).size === v.filters.skills.length &&
    Number.isSafeInteger(v.filters.server_matches) && Number(v.filters.server_matches) >= v.filters.servers.length &&
    v.filters.server_limit === 100 && instant(v.filters.retained_from) && nullableTime(v.filters.earliest_match_at) && nullableTime(v.filters.latest_match_at) &&
    object(v.filters.totals) && ["events", "servers", "skills"].every((key) => Number.isSafeInteger(totals[key]) && Number(totals[key]) >= 0) &&
    (Number(totals.events) === 0 ? v.filters.earliest_match_at === null && v.filters.latest_match_at === null :
      instant(v.filters.earliest_match_at) && instant(v.filters.latest_match_at) && v.filters.earliest_match_at <= v.filters.latest_match_at &&
      v.filters.earliest_match_at >= v.filters.retained_from && v.filters.latest_match_at <= v.as_of) &&
    Number(totals.events) >= v.events.length && object(v.capture) && typeof v.capture.lagging === "boolean" &&
    nullableTime(v.capture.activated_at) && nullableTime(v.capture.last_capture_at);
}
