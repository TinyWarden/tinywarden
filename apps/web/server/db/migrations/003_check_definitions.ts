import { sql, type Kysely } from "kysely";

// Historical migration: keep all values and constraints self-contained.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE TABLE tinywarden.check_definitions (
    definition_key text PRIMARY KEY CHECK (definition_key = 'disk-local'),
    kind text NOT NULL CHECK (kind = 'disk_usage'),
    current_revision bigint NOT NULL CHECK (current_revision BETWEEN 1 AND 9007199254740991)
  )`.execute(db);
  await sql`CREATE TABLE tinywarden.check_definition_revisions (
    definition_key text NOT NULL REFERENCES tinywarden.check_definitions(definition_key) ON DELETE RESTRICT,
    revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    warning_percent integer NOT NULL, critical_percent integer NOT NULL,
    interval_seconds integer NOT NULL,
    selector_version integer NOT NULL CHECK (selector_version = 1),
    evaluator_version integer NOT NULL CHECK (evaluator_version = 1),
    created_at timestamptz(3) NOT NULL,
    PRIMARY KEY (definition_key, revision),
    CHECK (warning_percent BETWEEN 1 AND 99 AND critical_percent BETWEEN 2 AND 100
      AND warning_percent < critical_percent AND interval_seconds BETWEEN 60 AND 3600)
  )`.execute(db);
  await sql`ALTER TABLE tinywarden.check_definitions ADD CONSTRAINT check_definition_current_fk
    FOREIGN KEY (definition_key, current_revision)
    REFERENCES tinywarden.check_definition_revisions(definition_key, revision)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED`.execute(db);
  await sql`CREATE TABLE tinywarden.host_check_policies (
    host_id uuid NOT NULL REFERENCES tinywarden.hosts(id) ON DELETE RESTRICT,
    definition_key text NOT NULL REFERENCES tinywarden.check_definitions(definition_key) ON DELETE RESTRICT,
    current_policy_version bigint NOT NULL CHECK (current_policy_version BETWEEN 0 AND 9007199254740991),
    last_delivery_revision bigint NOT NULL DEFAULT 0 CHECK (last_delivery_revision BETWEEN 0 AND 9007199254740991),
    PRIMARY KEY (host_id, definition_key)
  )`.execute(db);
  await sql`CREATE TABLE tinywarden.host_check_policy_revisions (
    host_id uuid NOT NULL, definition_key text NOT NULL,
    version bigint NOT NULL CHECK (version BETWEEN 0 AND 9007199254740991),
    mode text NOT NULL CHECK (mode IN ('inherit', 'override')),
    warning_percent integer, critical_percent integer, interval_seconds integer,
    pinned_definition_revision bigint,
    created_at timestamptz(3) NOT NULL,
    PRIMARY KEY (host_id, definition_key, version),
    FOREIGN KEY (host_id, definition_key) REFERENCES tinywarden.host_check_policies(host_id, definition_key)
      ON DELETE RESTRICT,
    FOREIGN KEY (definition_key, pinned_definition_revision)
      REFERENCES tinywarden.check_definition_revisions(definition_key, revision) ON DELETE RESTRICT,
    CHECK ((mode = 'inherit' AND warning_percent IS NULL AND critical_percent IS NULL
      AND interval_seconds IS NULL AND pinned_definition_revision IS NULL) OR
      (mode = 'override' AND warning_percent BETWEEN 1 AND 99
      AND critical_percent BETWEEN 2 AND 100 AND warning_percent < critical_percent
      AND interval_seconds BETWEEN 60 AND 3600 AND pinned_definition_revision IS NOT NULL)),
    CHECK (version > 0 OR mode = 'inherit')
  )`.execute(db);
  await sql`ALTER TABLE tinywarden.host_check_policies ADD CONSTRAINT host_policy_current_fk
    FOREIGN KEY (host_id, definition_key, current_policy_version)
    REFERENCES tinywarden.host_check_policy_revisions(host_id, definition_key, version)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED`.execute(db);
  await sql`CREATE UNIQUE INDEX agents_host_id_id ON tinywarden.agents(host_id, id)`.execute(db);
  await sql`CREATE TABLE tinywarden.check_assignment_snapshots (
    id uuid PRIMARY KEY,
    host_id uuid NOT NULL, definition_key text NOT NULL,
    agent_id uuid NOT NULL, generation bigint NOT NULL,
    revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    definition_revision bigint NOT NULL, policy_version bigint NOT NULL,
    mode text NOT NULL CHECK (mode IN ('inherit', 'override')),
    applicability text NOT NULL CHECK (applicability IN
      ('ready', 'unsupported_os', 'unsupported_architecture', 'missing_capability')),
    warning_percent integer NOT NULL, critical_percent integer NOT NULL,
    interval_seconds integer NOT NULL, selector_version integer NOT NULL CHECK (selector_version = 1),
    evaluator_version integer NOT NULL CHECK (evaluator_version = 1),
    created_at timestamptz(3) NOT NULL,
    payload_digest bytea NOT NULL CHECK (octet_length(payload_digest) = 32),
    UNIQUE (host_id, definition_key, revision),
    FOREIGN KEY (host_id, definition_key) REFERENCES tinywarden.host_check_policies(host_id, definition_key) ON DELETE RESTRICT,
    FOREIGN KEY (host_id, agent_id) REFERENCES tinywarden.agents(host_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (agent_id, generation) REFERENCES tinywarden.agent_credentials(agent_id, generation) ON DELETE RESTRICT,
    FOREIGN KEY (definition_key, definition_revision) REFERENCES tinywarden.check_definition_revisions(definition_key, revision) ON DELETE RESTRICT,
    FOREIGN KEY (host_id, definition_key, policy_version) REFERENCES tinywarden.host_check_policy_revisions(host_id, definition_key, version) ON DELETE RESTRICT,
    CHECK (warning_percent BETWEEN 1 AND 99 AND critical_percent BETWEEN 2 AND 100
      AND warning_percent < critical_percent AND interval_seconds BETWEEN 60 AND 3600)
  )`.execute(db);
  await sql`CREATE INDEX check_snapshots_agent_generation ON tinywarden.check_assignment_snapshots(agent_id, generation)`.execute(db);
  await sql`CREATE INDEX check_snapshots_source ON tinywarden.check_assignment_snapshots(definition_key, definition_revision)`.execute(db);
  await sql`CREATE INDEX check_snapshots_policy_source ON tinywarden.check_assignment_snapshots(host_id, definition_key, policy_version)`.execute(db);
  await sql`CREATE INDEX check_policies_definition ON tinywarden.host_check_policies(definition_key)`.execute(db);
  await sql`CREATE INDEX check_policy_revisions_definition ON tinywarden.host_check_policy_revisions(definition_key, pinned_definition_revision)`.execute(db);
  await sql`ALTER TABLE tinywarden.audit_events
    ADD COLUMN definition_key text REFERENCES tinywarden.check_definitions(definition_key) ON DELETE RESTRICT,
    ADD COLUMN from_definition_revision bigint,
    ADD COLUMN to_definition_revision bigint,
    ADD COLUMN from_policy_version bigint,
    ADD COLUMN to_policy_version bigint,
    ADD CONSTRAINT audit_from_definition_fk FOREIGN KEY (definition_key, from_definition_revision)
      REFERENCES tinywarden.check_definition_revisions(definition_key, revision) ON DELETE RESTRICT,
    ADD CONSTRAINT audit_to_definition_fk FOREIGN KEY (definition_key, to_definition_revision)
      REFERENCES tinywarden.check_definition_revisions(definition_key, revision) ON DELETE RESTRICT,
    ADD CONSTRAINT audit_from_policy_fk FOREIGN KEY (host_id, definition_key, from_policy_version)
      REFERENCES tinywarden.host_check_policy_revisions(host_id, definition_key, version) ON DELETE RESTRICT,
    ADD CONSTRAINT audit_to_policy_fk FOREIGN KEY (host_id, definition_key, to_policy_version)
      REFERENCES tinywarden.host_check_policy_revisions(host_id, definition_key, version) ON DELETE RESTRICT,
    ADD CONSTRAINT audit_check_action_shape CHECK (
      (action = 'check.definition_initialized' AND actor_kind = 'system' AND definition_key = 'disk-local'
        AND from_definition_revision IS NULL AND to_definition_revision = 1
        AND from_policy_version IS NULL AND to_policy_version IS NULL AND host_id IS NULL) OR
      (action = 'check.definition_updated' AND actor_kind = 'operator' AND definition_key = 'disk-local'
        AND from_definition_revision IS NOT NULL AND to_definition_revision = from_definition_revision + 1
        AND from_policy_version IS NULL AND to_policy_version IS NULL AND host_id IS NULL) OR
      (action = 'check.policy_updated' AND actor_kind = 'operator' AND definition_key = 'disk-local'
        AND host_id IS NOT NULL AND from_policy_version IS NOT NULL
        AND to_policy_version = from_policy_version + 1
        AND from_definition_revision IS NULL AND to_definition_revision IS NULL) OR
      (action NOT IN ('check.definition_initialized', 'check.definition_updated', 'check.policy_updated')
        AND definition_key IS NULL AND from_definition_revision IS NULL AND to_definition_revision IS NULL
        AND from_policy_version IS NULL AND to_policy_version IS NULL))`.execute(db);
  await sql`CREATE INDEX audit_check_definition ON tinywarden.audit_events(definition_key, occurred_at)`.execute(db);
  await sql`CREATE TABLE tinywarden.check_mutation_receipts (
    operator_id uuid NOT NULL REFERENCES tinywarden.operators(id) ON DELETE RESTRICT,
    request_id uuid NOT NULL,
    root text NOT NULL CHECK (root IN ('UpdateDiskDefinition', 'SetHostDiskPolicy')),
    definition_key text NOT NULL REFERENCES tinywarden.check_definitions(definition_key) ON DELETE RESTRICT,
    host_id uuid REFERENCES tinywarden.hosts(id) ON DELETE RESTRICT,
    request_fingerprint bytea NOT NULL CHECK (octet_length(request_fingerprint) = 32),
    changed boolean NOT NULL,
    resulting_definition_revision bigint,
    resulting_policy_version bigint,
    completed_at timestamptz(3) NOT NULL,
    PRIMARY KEY (operator_id, request_id),
    FOREIGN KEY (definition_key, resulting_definition_revision)
      REFERENCES tinywarden.check_definition_revisions(definition_key, revision) ON DELETE RESTRICT,
    FOREIGN KEY (host_id, definition_key, resulting_policy_version)
      REFERENCES tinywarden.host_check_policy_revisions(host_id, definition_key, version) ON DELETE RESTRICT,
    CHECK ((root = 'UpdateDiskDefinition' AND host_id IS NULL
      AND resulting_definition_revision IS NOT NULL AND resulting_policy_version IS NULL) OR
      (root = 'SetHostDiskPolicy' AND host_id IS NOT NULL
      AND resulting_definition_revision IS NULL AND resulting_policy_version IS NOT NULL))
  )`.execute(db);
  await sql`CREATE INDEX check_receipts_definition_revision ON tinywarden.check_mutation_receipts(definition_key, resulting_definition_revision)`.execute(db);
  await sql`CREATE INDEX check_receipts_policy_revision ON tinywarden.check_mutation_receipts(host_id, definition_key, resulting_policy_version)`.execute(db);
  await sql`INSERT INTO tinywarden.check_definitions(definition_key, kind, current_revision)
    VALUES ('disk-local', 'disk_usage', 1)`.execute(db);
  await sql`INSERT INTO tinywarden.check_definition_revisions
    (definition_key, revision, warning_percent, critical_percent, interval_seconds,
      selector_version, evaluator_version, created_at)
    VALUES ('disk-local', 1, 85, 95, 300, 1, 1, date_trunc('milliseconds', clock_timestamp()))`.execute(db);
  await sql`INSERT INTO tinywarden.audit_events
    (id, occurred_at, action, actor_kind, operator_id, target_operator_id, agent_id,
      target_agent_id, host_id, token_id, correlation_id, from_generation, to_generation,
      revoked, definition_key, from_definition_revision, to_definition_revision,
      from_policy_version, to_policy_version)
    VALUES (gen_random_uuid(), date_trunc('milliseconds', clock_timestamp()),
      'check.definition_initialized', 'system', NULL, NULL, NULL, NULL, NULL, NULL,
      gen_random_uuid(), NULL, NULL, NULL, 'disk-local', NULL, 1, NULL, NULL)`.execute(db);
  await sql`REVOKE ALL ON ALL TABLES IN SCHEMA tinywarden FROM PUBLIC`.execute(db);
}

export async function down(): Promise<void> {
  throw new Error("check_history_requires_forward_repair");
}
