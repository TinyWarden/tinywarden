import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Fresh installations migrate together; settle deferred seed references before DDL.
  await sql`SET CONSTRAINTS ALL IMMEDIATE`.execute(db);
  for (const name of ["check_definitions", "baseline_definitions"]) {
    await sql`ALTER TABLE ${sql.raw(`tinywarden.${name}`)}
      ADD COLUMN enabled boolean NOT NULL DEFAULT true,
      ADD COLUMN enablement_version bigint NOT NULL DEFAULT 1 CHECK (enablement_version BETWEEN 1 AND 9007199254740991),
      ADD COLUMN enablement_changed_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`.execute(db);
  }
  for (const name of ["check_assignment_snapshots", "baseline_snapshots", "history_subjects", "history_events", "notification_cursors"]) {
    await sql`ALTER TABLE ${sql.raw(`tinywarden.${name}`)} ADD COLUMN enablement_version bigint
      NOT NULL DEFAULT 1 CHECK (enablement_version BETWEEN 1 AND 9007199254740991)`.execute(db);
  }
  for (const name of ["check_assignment_snapshots", "baseline_snapshots"]) {
    await sql`ALTER TABLE ${sql.raw(`tinywarden.${name}`)} DROP CONSTRAINT ${sql.raw(`${name}_applicability_check`)}`.execute(db);
    await sql`ALTER TABLE ${sql.raw(`tinywarden.${name}`)} ADD CONSTRAINT ${sql.raw(`${name}_applicability_check`)}
      CHECK (applicability IN ('ready','unsupported_os','unsupported_architecture','missing_capability','disabled'))`.execute(db);
  }
  for (const [name, field] of [["history_subjects", "state"], ["history_events", "from_state"], ["history_events", "to_state"]]) {
    await sql`ALTER TABLE ${sql.raw(`tinywarden.${name}`)} DROP CONSTRAINT ${sql.raw(`${name}_${field}_check`)}`.execute(db);
    await sql`ALTER TABLE ${sql.raw(`tinywarden.${name}`)} ADD CONSTRAINT ${sql.raw(`${name}_${field}_check`)}
      CHECK (${sql.ref(field!)} IN ('healthy','warning','critical','unknown','stale','offline','disabled'))`.execute(db);
  }
  await sql`CREATE TABLE tinywarden.skill_enablement_receipts (
    operator_id uuid NOT NULL REFERENCES tinywarden.operators(id) ON DELETE RESTRICT,
    request_id uuid NOT NULL, skill_key text NOT NULL CHECK (skill_key IN ('disk-local','package-updates','reboot-required','fstrim-status')),
    request_fingerprint bytea NOT NULL CHECK (octet_length(request_fingerprint)=32),
    previous_enabled boolean NOT NULL, resulting_enabled boolean NOT NULL,
    previous_version bigint NOT NULL CHECK (previous_version BETWEEN 1 AND 9007199254740991),
    resulting_version bigint NOT NULL CHECK (resulting_version BETWEEN 1 AND 9007199254740991),
    changed boolean NOT NULL, completed_at timestamptz(3) NOT NULL, correlation_id uuid NOT NULL,
    PRIMARY KEY (operator_id,request_id),
    CHECK ((changed AND previous_enabled<>resulting_enabled AND resulting_version=previous_version+1)
      OR (NOT changed AND previous_enabled=resulting_enabled AND resulting_version=previous_version))
  )`.execute(db);
  await sql`REVOKE ALL ON tinywarden.skill_enablement_receipts FROM PUBLIC`.execute(db);
}
export async function down(): Promise<void> { throw new Error("skill_enablement_requires_forward_repair"); }
