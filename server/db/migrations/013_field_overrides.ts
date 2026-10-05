import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`SET CONSTRAINTS ALL IMMEDIATE`.execute(db);
  // Canonical order is enforced without changing any legacy rows (NULL mask).
  await sql`CREATE FUNCTION tinywarden.canonical_override_fields(fields text[]) RETURNS boolean
    LANGUAGE sql IMMUTABLE STRICT AS $$
    SELECT COALESCE(array_ndims(fields)=1 AND array_lower(fields,1)=1, cardinality(fields)=0)
      AND array_position(fields,NULL) IS NULL
      AND fields = ARRAY(SELECT x FROM (SELECT DISTINCT x FROM unnest(fields) x) s ORDER BY x COLLATE "C")
    $$`.execute(db);
  await sql`ALTER TABLE tinywarden.host_check_policy_revisions ADD COLUMN override_fields text[],
    ADD CONSTRAINT disk_override_fields CHECK (override_fields IS NULL OR (
      tinywarden.canonical_override_fields(override_fields)
      AND override_fields <@ ARRAY['critical_percent','interval_seconds','warning_percent']::text[]
      AND ((mode='inherit' AND cardinality(override_fields)=0) OR (mode='override' AND cardinality(override_fields)>0))))`.execute(db);
  await sql`ALTER TABLE tinywarden.baseline_policy_revisions ADD COLUMN override_fields text[],
    ADD CONSTRAINT baseline_override_fields CHECK (override_fields IS NULL OR (
      tinywarden.canonical_override_fields(override_fields)
      AND override_fields <@ CASE WHEN definition_key='package-updates'
        THEN ARRAY['interval_seconds','package_mode','timeout_seconds']::text[] ELSE ARRAY['interval_seconds','timeout_seconds']::text[] END
      AND ((mode='inherit' AND cardinality(override_fields)=0) OR (mode='override' AND cardinality(override_fields)>0))))`.execute(db);
}
export async function down(): Promise<void> { throw new Error("field_overrides_require_forward_repair"); }
