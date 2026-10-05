import { maxEpoch } from "./types";

export function object(value: unknown, fields: string): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = fields.split(" ");
  return Object.keys(value).length === keys.length && keys.every((k) => Object.hasOwn(value, k));
}
export function member(value: unknown, choices: string): value is string {
  return typeof value === "string" && choices.split("|").includes(value);
}
export function integer(value: unknown, max: number, min = 0): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}
export function timestamp(value: unknown): boolean { return value === null || integer(value, maxEpoch, 1); }
export function condition(value: unknown): boolean {
  return object(value, "passed checked_at") && timestamp(value.checked_at) &&
    (value.checked_at === null ? value.passed === null : typeof value.passed === "boolean");
}
export function states(value: Record<string, unknown>): boolean {
  return member(value.load_state, "loaded|not-found|error|bad-setting|masked|merged|stub") &&
    member(value.active_state, "active|reloading|inactive|failed|activating|deactivating|refreshing|maintenance");
}
