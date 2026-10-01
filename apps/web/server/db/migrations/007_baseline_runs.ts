import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE TABLE tinywarden.baseline_runs (
    id uuid PRIMARY KEY, host_id uuid NOT NULL, agent_id uuid NOT NULL,
    generation bigint NOT NULL CHECK (generation BETWEEN 1 AND 9007199254740991), definition_key text NOT NULL,
    run_sequence bigint NOT NULL CHECK (run_sequence BETWEEN 1 AND 9007199254740991), assignment_id uuid NOT NULL,
    started_at timestamptz(3) NOT NULL, finished_at timestamptz(3) NOT NULL, received_at timestamptz(3) NOT NULL,
    dropped_runs bigint NOT NULL CHECK (dropped_runs BETWEEN 0 AND 9007199254740991),
    observation jsonb NOT NULL CHECK (jsonb_typeof(observation)='object' AND octet_length(observation::text)<=32768),
    request_digest bytea NOT NULL CHECK (octet_length(request_digest)=32),
    UNIQUE (agent_id,generation,run_sequence),
    FOREIGN KEY (host_id,agent_id) REFERENCES tinywarden.agents(host_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (agent_id,generation) REFERENCES tinywarden.agent_credentials(agent_id,generation) ON DELETE RESTRICT,
    FOREIGN KEY (assignment_id,host_id,agent_id,generation,definition_key)
      REFERENCES tinywarden.baseline_snapshots(id,host_id,agent_id,generation,definition_key) ON DELETE RESTRICT,
    CHECK (started_at<=finished_at)
  )`.execute(db);
  await sql`CREATE INDEX baseline_run_history ON tinywarden.baseline_runs(host_id,definition_key,received_at DESC,id DESC)`.execute(db);
  await sql`CREATE INDEX baseline_run_sequence ON tinywarden.baseline_runs(agent_id,generation,definition_key,run_sequence DESC)`.execute(db);
  await sql`CREATE INDEX baseline_run_snapshot ON tinywarden.baseline_runs(assignment_id)`.execute(db);
  await sql`CREATE TABLE tinywarden.baseline_recovery_latches (
    host_id uuid NOT NULL, agent_id uuid NOT NULL,
    generation bigint NOT NULL CHECK (generation BETWEEN 1 AND 9007199254740991),
    reason text NOT NULL CHECK (reason IN ('assignment_revision_regressed','assignment_identity_conflict','assignment_snapshot_missing')),
    latched_at timestamptz(3) NOT NULL, PRIMARY KEY (agent_id,generation),
    FOREIGN KEY (host_id,agent_id) REFERENCES tinywarden.agents(host_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (agent_id,generation) REFERENCES tinywarden.agent_credentials(agent_id,generation) ON DELETE RESTRICT
  )`.execute(db);
  await sql`CREATE INDEX baseline_recovery_host ON tinywarden.baseline_recovery_latches(host_id,agent_id,generation)`.execute(db);
  await sql`REVOKE ALL ON tinywarden.baseline_runs,tinywarden.baseline_recovery_latches FROM PUBLIC`.execute(db);
}
export async function down(): Promise<void> { throw new Error("baseline_runs_require_forward_repair"); }
