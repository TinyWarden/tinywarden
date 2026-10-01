import { sql, type Kysely } from "kysely";

// A restored server must remember current-generation authority regressions before replying 409.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE TABLE tinywarden.disk_recovery_latches (
    agent_id uuid NOT NULL,
    generation bigint NOT NULL CHECK (generation BETWEEN 1 AND 9007199254740991),
    host_id uuid NOT NULL,
    reason text NOT NULL CHECK (reason IN ('assignment_revision_regressed',
      'assignment_identity_conflict', 'assignment_snapshot_missing')),
    latched_at timestamptz(3) NOT NULL,
    PRIMARY KEY (agent_id,generation),
    FOREIGN KEY (host_id,agent_id) REFERENCES tinywarden.agents(host_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (agent_id,generation)
      REFERENCES tinywarden.agent_credentials(agent_id,generation) ON DELETE RESTRICT
  )`.execute(db);
  await sql`CREATE INDEX disk_recovery_host ON tinywarden.disk_recovery_latches(host_id,agent_id,generation)`.execute(db);
  await sql`REVOKE ALL ON tinywarden.disk_recovery_latches FROM PUBLIC`.execute(db);
}

export async function down(): Promise<void> {
  throw new Error("disk_recovery_requires_forward_repair");
}
