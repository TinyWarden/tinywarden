import {sql,type Kysely} from "kysely";
export async function up(db:Kysely<unknown>){
  await sql`ALTER TABLE tinywarden.skill_runtime_hosts ADD COLUMN manual_runs_supported boolean NOT NULL DEFAULT false`.execute(db);
  await sql`CREATE TABLE tinywarden.skill_manual_runs (
    id uuid PRIMARY KEY, operator_id uuid NOT NULL REFERENCES tinywarden.operators(id),
    host_id uuid NOT NULL REFERENCES tinywarden.hosts(id), agent_id uuid NOT NULL REFERENCES tinywarden.agents(id),
    generation bigint NOT NULL, installation_id uuid NOT NULL REFERENCES tinywarden.skill_installations(id),
    content_sha256 text NOT NULL REFERENCES tinywarden.skill_packages(content_sha256),
    enablement_version bigint NOT NULL, settings_revision bigint NOT NULL, policy_version bigint NOT NULL,
    requested_at timestamptz(3) NOT NULL, queue_expires_at timestamptz(3) NOT NULL CHECK(queue_expires_at>requested_at),
    phase text NOT NULL CHECK(phase IN ('queued','running','completed','failed')),
    started_at timestamptz(3), run_deadline timestamptz(3), result_deadline timestamptz(3),
    completed_at timestamptz(3), reason text, assignment_id uuid REFERENCES tinywarden.skill_assignments(id),
    run_id uuid UNIQUE, run_sequence bigint CHECK(run_sequence BETWEEN 1 AND 9007199254740991),
    CHECK((run_id IS NULL AND run_sequence IS NULL AND assignment_id IS NULL) OR
      (run_id IS NOT NULL AND run_sequence IS NOT NULL AND assignment_id IS NOT NULL)),
    CHECK((started_at IS NULL AND run_deadline IS NULL AND result_deadline IS NULL) OR
      (started_at IS NOT NULL AND run_deadline>started_at AND result_deadline>=run_deadline)),
    CHECK((phase IN ('queued','running') AND completed_at IS NULL AND reason IS NULL) OR
      (phase IN ('completed','failed') AND completed_at>=requested_at AND reason IS NOT NULL)),
    CHECK(phase<>'queued' OR started_at IS NULL),
    CHECK(phase NOT IN ('running','completed') OR (started_at IS NOT NULL AND run_id IS NOT NULL)),
    FOREIGN KEY(agent_id,generation) REFERENCES tinywarden.agent_credentials(agent_id,generation)
  )`.execute(db);
  await sql`CREATE UNIQUE INDEX skill_manual_one_active ON tinywarden.skill_manual_runs(host_id,installation_id) WHERE phase IN ('queued','running')`.execute(db);
  await sql`CREATE INDEX skill_manual_latest ON tinywarden.skill_manual_runs(host_id,installation_id,requested_at DESC,id DESC)`.execute(db);
  await sql`CREATE INDEX skill_manual_agent ON tinywarden.skill_manual_runs(agent_id,generation,queue_expires_at) WHERE phase IN ('queued','running')`.execute(db);
  await sql`CREATE INDEX skill_manual_retention ON tinywarden.skill_manual_runs(requested_at,id)`.execute(db);
  await sql`REVOKE ALL ON tinywarden.skill_manual_runs FROM PUBLIC`.execute(db);
}
export async function down():Promise<void>{throw new Error("manual_runs_require_forward_repair");}
