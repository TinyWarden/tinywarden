import type { PackageMetadata, SkillSettings, PackageFieldError } from "../../../lib/skills/package-types";
import { matchesSchema } from "../../../lib/skills/schema-values";
import { fail, PackageSettingsError } from "../../errors";
import { invokePackage } from "../runtime/client";
import { packageDirectory } from "../runtime/storage";

export function parsedSettings(value: unknown): SkillSettings {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 64 || Buffer.byteLength(JSON.stringify(value)) > 65536) fail("invalid_request", 400);
  for (const [key, entry] of Object.entries(value)) {
    if (!/^[A-Za-z0-9_]{1,64}$/.test(key) || !["string", "number", "boolean"].includes(typeof entry) ||
      typeof entry === "number" && !Number.isFinite(entry) || typeof entry === "string" && entry.length > 65536) fail("invalid_request", 400);
  }
  return value as SkillSettings;
}
export async function validateSettings(metadata: PackageMetadata, official: boolean, settings: SkillSettings, store?: string) {
  if (!matchesSchema(metadata.schemas.settings, settings)) fail("invalid_request", 400);
  const errors = await invokePackage<PackageFieldError[]>(packageDirectory(metadata.content_sha256, store),
    metadata.content_sha256, official, "validate_settings", settings);
  if (errors.length) throw new PackageSettingsError(errors);
}
export function effectiveSettings(defaults: SkillSettings, overrides: SkillSettings): SkillSettings {
  return { ...defaults, ...overrides };
}
export function sameSettings(a: SkillSettings, b: SkillSettings) {
  const keys = Object.keys(a).sort();
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}
