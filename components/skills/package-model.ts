import type { Wire } from "@/components/operator/format";
import type { readPackageSkills } from "@/server/skills/catalog/package-controls";
import type { readPackageResults } from "@/server/skills/results/package-projection";
import { instant } from "@/components/operator/read-validation";
export type InstalledPackage = Wire<Awaited<ReturnType<typeof readPackageSkills>>>[number];
export type PackageList = { schema_version: 1; as_of: string; skills: InstalledPackage[] };
export type PackageResults = Wire<Awaited<ReturnType<typeof readPackageResults>>> & { schema_version: 1 };
export function validPackages(value: unknown): value is PackageList {
  const v = value as PackageList;
  return !!v && v.schema_version === 1 && instant(v.as_of) && Array.isArray(v.skills) && v.skills.length <= 100 &&
    v.skills.every((s) => typeof s.id === "string" && /^[0-9a-f]{64}$/.test(s.content_sha256) && typeof s.enabled === "boolean" &&
      typeof s.settings_revision === "string" && typeof s.enablement_version === "string" && !!s.metadata?.manifest && !!s.metadata.catalog && !!s.defaults) &&
    new Set(v.skills.map((s) => s.id)).size === v.skills.length;
}
export function validPackageResults(value: unknown): value is PackageResults {
  const v = value as PackageResults;
  return !!v && v.schema_version === 1 && instant(v.as_of) && typeof v.host_id === "string" && Array.isArray(v.skills) &&
    v.skills.length <= 100 && Array.isArray(v.readings) && v.readings.length <= 100 && Array.isArray(v.catalogs) &&
    v.skills.every((s) => typeof s.installation_id === "string" && typeof s.name === "string" && typeof s.reason === "string" &&
      ["healthy","warning","critical","unknown","stale","disabled"].includes(s.state) && !!s.metadata?.catalog &&
      (s.valid_until === null || instant(s.valid_until)));
}
