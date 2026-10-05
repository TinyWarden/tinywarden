import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  const retention=await sql<{definition:string}>`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
    WHERE conrelid='tinywarden.audit_events'::regclass AND conname='audit_retention_shape'`.execute(db);
  const old=retention.rows[0]?.definition;
  if(!old || old.split("'history'::text").length!==2)throw new Error("unexpected_retention_constraint");
  await sql`ALTER TABLE tinywarden.audit_events DROP CONSTRAINT audit_retention_shape`.execute(db);
  await sql`ALTER TABLE tinywarden.audit_events ADD CONSTRAINT audit_retention_shape ${sql.raw(old.replace("'history'::text","'history'::text, 'packages'::text"))}`.execute(db);
  for (const table of ["history_subjects", "history_events", "notification_cursors"]) {
    await sql`ALTER TABLE ${sql.id("tinywarden", table)} DROP CONSTRAINT ${sql.id(`${table}_subject_key_check`)}`.execute(db);
    await sql`ALTER TABLE ${sql.id("tinywarden", table)} ADD CONSTRAINT ${sql.id(`${table}_subject_key_check`)}
      CHECK(subject_key IN ('contact','disk-local','package-updates','reboot-required','fstrim-status') OR
        subject_key ~ '^[a-z][a-z0-9-]{0,63}/[a-z][a-z0-9-]{0,63}$')`.execute(db);
  }
  for (const table of ["history_subjects", "history_events"]) {
    await sql`ALTER TABLE ${sql.id("tinywarden", table)} DROP CONSTRAINT ${sql.id(`${table}_assessment_version_check`)}`.execute(db);
    await sql`ALTER TABLE ${sql.id("tinywarden", table)} ADD CONSTRAINT ${sql.id(`${table}_assessment_version_check`)}
      CHECK(assessment_version IN (1,2,3,4))`.execute(db);
  }
  // Locate the old anonymous state/subject constraint by its dependencies,
  // preserving the independent contact scope and state vocabulary checks.
  const constraints = await sql<{ conname: string }>`SELECT conname FROM pg_constraint
    WHERE conrelid='tinywarden.notification_cursors'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%subject_key%'
      AND pg_get_constraintdef(oid) LIKE '%last_state%'`.execute(db);
  if (constraints.rows.length !== 1) throw new Error("unexpected_notification_constraint");
  await sql`ALTER TABLE tinywarden.notification_cursors DROP CONSTRAINT ${sql.id(constraints.rows[0]!.conname)}`.execute(db);
  await sql`ALTER TABLE tinywarden.notification_cursors ADD CONSTRAINT notification_skill_states
    CHECK(last_state IS NULL OR subject_key='contact' AND last_state IN ('healthy','offline')
      OR subject_key<>'contact' AND last_state IN ('healthy','warning','critical'))`.execute(db);
}
export async function down(): Promise<void> { throw new Error("package_subjects_require_forward_repair"); }
