import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE tinywarden.baseline_runs ADD COLUMN fstrim_context jsonb
    CHECK (fstrim_context IS NULL OR definition_key='fstrim-status' AND jsonb_typeof(fstrim_context)='object'
      AND octet_length(fstrim_context::text)<=4096)`.execute(db);
  for (const table of ["baseline_runs", "history_subjects", "history_events"]) {
    const name = `${table}_assessment_version_check`;
    await sql`ALTER TABLE ${sql.raw(`tinywarden.${table}`)} DROP CONSTRAINT ${sql.id(name)}`.execute(db);
    await sql`ALTER TABLE ${sql.raw(`tinywarden.${table}`)} ADD CONSTRAINT ${sql.id(name)}
      CHECK (assessment_version IN (1,2,3))`.execute(db);
  }
}
export async function down(): Promise<void> { throw new Error("fstrim_context_requires_forward_repair"); }
