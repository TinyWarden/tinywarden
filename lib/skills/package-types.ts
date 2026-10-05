export type PackageSkillId = `${string}/${string}`;
export type Scalar = string | number | boolean;
export type SkillSettings = Record<string, Scalar>;
export interface ValueSchema {
  type: "object" | "array" | "string" | "number" | "integer" | "boolean";
  properties?: Record<string, ValueSchema>; required?: string[]; additionalProperties?: false;
  items?: ValueSchema; enum?: Scalar[]; minimum?: number; maximum?: number;
  minLength?: number; maxLength?: number; minItems?: number; maxItems?: number;
}
export interface CatalogEntry { text: string; parameters: Record<string, "string" | "number" | "boolean"> }
export type PackageCatalog = Record<string, CatalogEntry>;
export interface PackageField { label_key: string; help_key: string; unit: string; order: number }
export interface SkillManifest {
  format: 1; id: PackageSkillId; version: string; runtime: "python-3.13-v1"; sdk: 1;
  state_version: number; license: string; publisher: string; name_key: string; description_key: string;
  category: string; compatibility: { os: string[]; architectures: string[] };
  defaults: SkillSettings; schedule: { minimum_seconds: number; maximum_seconds: number };
  capabilities: Record<string, unknown>[]; limits: { wall_seconds: number };
  fields: Record<string, PackageField>; alias?: string;
}
export interface PackageMetadata {
  manifest: SkillManifest; schemas: { settings: ValueSchema; observation: ValueSchema; state: ValueSchema };
  catalog: PackageCatalog; content_sha256: string; size: number;
  archive?: { sha256: string; size: number };
}
export interface PackageReason { key: string; params: Record<string, Scalar> }
export type FactKind = "text" | "number" | "boolean" | "duration" | "time" | "percent";
export type PackageFact = { key: string; label_key: string; kind: FactKind; value: Scalar }
  | { key: string; label_key: string; kind: "table";
      columns: { key: string; label_key: string; kind: FactKind }[];
      rows: Record<string, Scalar>[]; truncated: boolean };
export interface PackageAssessment {
  from: number; status: "healthy" | "warning" | "critical" | "unknown";
  reason: PackageReason; facts: PackageFact[];
}
export interface PackageContext {
  identity: { installation_id: string; content_sha256: string; assignment_id: string; generation: string };
  settings: SkillSettings; observation: unknown; previous_state: unknown; state: unknown;
  captured_at: number; received_at: number; now: number; evidence_expires_at: number;
}
export interface PackageFieldError { field: string; message: PackageReason }
export function isPackageSkillId(value: unknown): value is PackageSkillId {
  return typeof value === "string" && /^[a-z][a-z0-9-]{0,63}\/[a-z][a-z0-9-]{0,63}$/.test(value);
}
export function packageText(catalog: PackageCatalog, reason: PackageReason): string {
  const entry = Object.hasOwn(catalog, reason.key) ? catalog[reason.key] : undefined;
  if (!entry) return reason.key;
  return entry.text.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, key: string) => String(reason.params[key] ?? ""));
}
