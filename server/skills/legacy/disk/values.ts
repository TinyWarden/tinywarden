import { disk } from "../../../../lib/skills/builtin/disk";
import { fail } from "../../../errors";
import { diskFields, parseOverrides } from "../../settings/field-overrides";
import { ascii, uuid } from "../../../validation";

export const key = disk.key;
export const capability = disk.capability;
export interface Values { warning_percent: number; critical_percent: number; interval_seconds: number }
export type Mode = "inherit" | "override";

export function revision(value: unknown, minimum = 1): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) ||
      value < minimum || value > Number.MAX_SAFE_INTEGER) fail("invalid_request", 400);
  return value;
}

export function values(raw: Record<string, unknown>): Values {
  const warning = raw.warning_percent, critical = raw.critical_percent, interval = raw.interval_seconds;
  if (typeof warning !== "number" || !Number.isInteger(warning) || warning < 1 || warning > 99 ||
      typeof critical !== "number" || !Number.isInteger(critical) || critical <= warning || critical > 100 ||
      typeof interval !== "number" || !Number.isInteger(interval) || interval < 60 || interval > 3600) {
    fail("invalid_request", 400);
  }
  return { warning_percent: warning, critical_percent: critical, interval_seconds: interval };
}

export function definitionInput(raw: Record<string, unknown>) {
  return { requestId: uuid(raw.request_id), expectedRevision: revision(raw.expected_revision),
    values: values(raw) };
}

export function policyInput(raw: Record<string, unknown>) {
  if (raw.schema_version === 2) {
    const overrides = parseOverrides(raw.overrides, diskFields) as Partial<Values>;
    return { schemaVersion: 2 as const, requestId: uuid(raw.request_id), expectedPolicyVersion: revision(raw.expected_policy_version, 0),
      expectedDefaultRevision: revision(raw.expected_default_revision), overrides,
      mode: Object.keys(overrides).length ? "override" as const : "inherit" as const, values: null };
  }
  const mode = raw.mode;
  if (mode !== "inherit" && mode !== "override") fail("invalid_request", 400);
  const hasValues = ["warning_percent", "critical_percent", "interval_seconds"]
    .every((name) => Object.hasOwn(raw, name));
  if ((mode === "override") !== hasValues) fail("invalid_request", 400);
  return { schemaVersion: 1 as const, overrides: {} as Partial<Values>, requestId: uuid(raw.request_id),
    expectedPolicyVersion: revision(raw.expected_policy_version, 0),
    expectedDefaultRevision: revision(raw.expected_default_revision),
    mode: mode as Mode, values: mode === "override" ? values(raw) : null };
}

export function assignmentInput(raw: Record<string, unknown>) {
  const agentVersion = ascii(raw.agent_version, /^[A-Za-z0-9.+-]+$/, 1, 64);
  if (!Array.isArray(raw.capabilities) || raw.capabilities.length > 8 ||
      !raw.capabilities.every((entry) => typeof entry === "string" &&
        /^[A-Za-z0-9._-]{1,64}$/.test(entry)) ||
      new Set(raw.capabilities).size !== raw.capabilities.length) fail("invalid_request", 400);
  let known: { id: string; revision: number; digest: string } | null = null;
  if (raw.known_assignment !== null) {
    const item = raw.known_assignment;
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        Object.keys(item).sort().join(",") !== "digest,id,revision") fail("invalid_request", 400);
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.digest !== "string" || !/^[0-9a-f]{64}$/.test(candidate.digest)) {
      fail("invalid_request", 400);
    }
    known = { id: uuid(candidate.id), revision: revision(candidate.revision), digest: candidate.digest };
  }
  return { agentVersion, capabilities: raw.capabilities as string[], known };
}
