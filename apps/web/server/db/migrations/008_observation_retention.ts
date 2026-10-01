import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const family of ["disk", "baseline"] as const) {
    const table = sql.raw(`tinywarden.${family}_run_receipts`);
    const snapshots = sql.raw(`tinywarden.${family === "disk" ? "check_assignment" : "baseline"}_snapshots`);
    const keyColumn = family === "baseline" ? sql`definition_key text NOT NULL,` : sql``;
    const keyScope = family === "baseline" ? sql`,definition_key` : sql``;
    await sql`CREATE TABLE ${table} (
      id uuid PRIMARY KEY, host_id uuid NOT NULL, agent_id uuid NOT NULL,
      generation bigint NOT NULL CHECK (generation BETWEEN 1 AND 9007199254740991),
      run_sequence bigint NOT NULL CHECK (run_sequence BETWEEN 1 AND 9007199254740991),
      assignment_id uuid NOT NULL, ${keyColumn}
      received_at timestamptz(3) NOT NULL,
      request_digest bytea NOT NULL CHECK (octet_length(request_digest)=32),
      UNIQUE (agent_id,generation,run_sequence),
      FOREIGN KEY (host_id,agent_id) REFERENCES tinywarden.agents(host_id,id) ON DELETE RESTRICT,
      FOREIGN KEY (agent_id,generation) REFERENCES tinywarden.agent_credentials(agent_id,generation) ON DELETE RESTRICT,
      FOREIGN KEY (assignment_id,host_id,agent_id,generation${keyScope})
        REFERENCES ${snapshots}(id,host_id,agent_id,generation${keyScope}) ON DELETE RESTRICT
    )`.execute(db);
    await sql`CREATE INDEX ${sql.raw(`${family}_receipts_host`)} ON ${table}(host_id,agent_id)`.execute(db);
    await sql`CREATE INDEX ${sql.raw(`${family}_receipts_assignment`)} ON ${table}(assignment_id,run_sequence DESC)`.execute(db);
    await sql`REVOKE ALL ON ${table} FROM PUBLIC`.execute(db);
    await sql`CREATE INDEX ${sql.raw(`${family}_runs_expiry`)} ON
      ${sql.raw(`tinywarden.${family}_runs`)}(received_at,id)`.execute(db);
  }
  await sql`CREATE INDEX baseline_receipts_latest ON tinywarden.baseline_run_receipts
    (agent_id,generation,definition_key,run_sequence DESC)`.execute(db);
  await sql`ALTER TABLE tinywarden.audit_events
    ADD COLUMN retention_family text,
    ADD COLUMN retention_cutoff timestamptz(3),
    ADD COLUMN retention_days integer,
    ADD COLUMN retention_parent_count integer,
    ADD COLUMN retention_mount_count integer,
    ADD CONSTRAINT audit_retention_shape CHECK (
      (action='observation.retention_pruned' AND actor_kind='system'
        AND operator_id IS NULL AND agent_id IS NULL AND target_operator_id IS NULL
        AND target_agent_id IS NULL AND host_id IS NULL AND token_id IS NULL
        AND from_generation IS NULL AND to_generation IS NULL AND revoked IS NULL
        AND definition_key IS NULL AND from_definition_revision IS NULL AND to_definition_revision IS NULL
        AND from_policy_version IS NULL AND to_policy_version IS NULL
        AND baseline_key IS NULL AND from_baseline_revision IS NULL AND to_baseline_revision IS NULL
        AND from_baseline_policy IS NULL AND to_baseline_policy IS NULL
        AND retention_family IS NOT NULL AND retention_family IN ('disk','baseline')
        AND retention_cutoff IS NOT NULL AND retention_days IS NOT NULL AND retention_days=90
        AND retention_parent_count IS NOT NULL AND retention_parent_count BETWEEN 1 AND 100
        AND retention_mount_count IS NOT NULL AND retention_mount_count BETWEEN 0 AND 12800
        AND (retention_family='disk' OR retention_mount_count=0))
      OR (action<>'observation.retention_pruned' AND retention_family IS NULL
        AND retention_cutoff IS NULL AND retention_days IS NULL
        AND retention_parent_count IS NULL AND retention_mount_count IS NULL)
    )`.execute(db);
}
export async function down(): Promise<void> { throw new Error("retention_requires_forward_repair"); }
