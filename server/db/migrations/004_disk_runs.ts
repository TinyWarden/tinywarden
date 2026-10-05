import { sql, type Kysely } from "kysely";

// Historical migration. Run rows are immutable evidence, scoped to a delivered snapshot.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE tinywarden.check_assignment_snapshots
    ADD CONSTRAINT check_snapshot_run_scope UNIQUE (id,host_id,agent_id,generation)`.execute(db);
  await sql`CREATE TABLE tinywarden.disk_runs (
    id uuid PRIMARY KEY,
    host_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    generation bigint NOT NULL CHECK (generation BETWEEN 1 AND 9007199254740991),
    run_sequence bigint NOT NULL CHECK (run_sequence BETWEEN 1 AND 9007199254740991),
    assignment_id uuid NOT NULL,
    started_at timestamptz(3) NOT NULL,
    finished_at timestamptz(3) NOT NULL,
    received_at timestamptz(3) NOT NULL,
    coverage text NOT NULL CHECK (coverage IN ('complete','incomplete')),
    reason text NOT NULL CHECK (reason IN ('none','inventory_unavailable','inventory_malformed',
      'inventory_overflow','records_overflow','topology_changed','mount_disappeared',
      'mount_inaccessible','mount_unverifiable','unsupported_type','collector_timeout',
      'collector_failed','output_overflow','queue_overflow')),
    excluded_kernel integer NOT NULL CHECK (excluded_kernel BETWEEN 0 AND 4096),
    excluded_remote integer NOT NULL CHECK (excluded_remote BETWEEN 0 AND 4096),
    dropped_runs bigint NOT NULL CHECK (dropped_runs BETWEEN 0 AND 9007199254740991),
    worst_classification text NOT NULL CHECK (worst_classification IN ('healthy','warning','critical','unknown')),
    request_digest bytea NOT NULL CHECK (octet_length(request_digest) = 32),
    UNIQUE (agent_id,generation,run_sequence),
    FOREIGN KEY (host_id,agent_id) REFERENCES tinywarden.agents(host_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (agent_id,generation) REFERENCES tinywarden.agent_credentials(agent_id,generation) ON DELETE RESTRICT,
    FOREIGN KEY (assignment_id,host_id,agent_id,generation)
      REFERENCES tinywarden.check_assignment_snapshots(id,host_id,agent_id,generation) ON DELETE RESTRICT,
    CHECK (started_at <= finished_at),
    CHECK ((coverage = 'complete' AND reason = 'none') OR
      (coverage = 'incomplete' AND reason <> 'none'))
  )`.execute(db);
  await sql`CREATE TABLE tinywarden.disk_run_mounts (
    run_id uuid NOT NULL REFERENCES tinywarden.disk_runs(id) ON DELETE RESTRICT,
    mount_id integer NOT NULL CHECK (mount_id > 0),
    mount_path text NOT NULL CHECK (octet_length(mount_path) BETWEEN 1 AND 1024),
    mount_root text NOT NULL CHECK (octet_length(mount_root) BETWEEN 1 AND 1024),
    filesystem_type text NOT NULL CHECK (filesystem_type ~ '^[a-zA-Z0-9._+-]{1,64}$'),
    kind text NOT NULL CHECK (kind IN ('local','unsupported')),
    writable boolean NOT NULL,
    shared_capacity boolean NOT NULL,
    reason text NOT NULL CHECK (reason IN ('none','unsupported_type','mount_disappeared',
      'mount_inaccessible','mount_unverifiable')),
    classification text NOT NULL CHECK (classification IN
      ('healthy','warning','critical','informational','unknown')),
    total_bytes numeric(20,0), free_bytes numeric(20,0), available_bytes numeric(20,0),
    PRIMARY KEY (run_id,mount_id),
    CHECK ((kind = 'unsupported' AND reason = 'unsupported_type' AND total_bytes IS NULL
      AND free_bytes IS NULL AND available_bytes IS NULL) OR
      (kind = 'local' AND ((reason = 'none' AND total_bytes IS NOT NULL
        AND free_bytes IS NOT NULL AND available_bytes IS NOT NULL) OR
        (reason <> 'none' AND total_bytes IS NULL AND free_bytes IS NULL
        AND available_bytes IS NULL)))),
    CHECK (total_bytes BETWEEN 0 AND 18446744073709551615
      AND free_bytes BETWEEN 0 AND total_bytes
      AND available_bytes BETWEEN 0 AND free_bytes)
  )`.execute(db);
  await sql`CREATE INDEX disk_runs_host_received ON tinywarden.disk_runs(host_id,received_at DESC,id DESC)`.execute(db);
  await sql`CREATE INDEX disk_runs_assignment_sequence ON tinywarden.disk_runs(assignment_id,run_sequence DESC)`.execute(db);
  await sql`CREATE INDEX disk_runs_scope ON tinywarden.disk_runs(agent_id,generation)`.execute(db);
  await sql`REVOKE ALL ON tinywarden.disk_runs,tinywarden.disk_run_mounts FROM PUBLIC`.execute(db);
}

export async function down(): Promise<void> {
  throw new Error("disk_history_requires_forward_repair");
}
