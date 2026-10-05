import type { ValueSchema } from "./package-types";
export function matchesSchema(schema: ValueSchema, value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (schema.enum && !schema.enum.some((entry) => entry === value)) return false;
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>, properties = schema.properties ?? {};
    return Object.keys(record).every((key) => Object.hasOwn(properties, key) && matchesSchema(properties[key]!, record[key], depth + 1)) &&
      (schema.required ?? []).every((key) => Object.hasOwn(record, key));
  }
  if (schema.type === "array") return Array.isArray(value) && value.length >= (schema.minItems ?? 0) &&
    value.length <= schema.maxItems! && !!schema.items && value.every((item) => matchesSchema(schema.items!, item, depth + 1));
  if (schema.type === "string") return typeof value === "string" && Array.from(value).length >= (schema.minLength ?? 0) && Array.from(value).length <= schema.maxLength!;
  if (schema.type === "boolean") return typeof value === "boolean";
  return typeof value === "number" && Number.isFinite(value) && (schema.type !== "integer" || Number.isSafeInteger(value)) &&
    value >= schema.minimum! && value <= schema.maximum!;
}
