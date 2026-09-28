import { sql, type Kysely } from "kysely";

// Historical SQL is deliberately self-contained; never import current table types.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE TABLE tinywarden.operators (
    id uuid PRIMARY KEY, singleton boolean NOT NULL UNIQUE CHECK (singleton),
    login text NOT NULL UNIQUE CHECK (login = 'admin'),
    password_algorithm text NOT NULL CHECK (password_algorithm = 'scrypt-v1'),
    password_n integer NOT NULL CHECK (password_n = 131072),
    password_r integer NOT NULL CHECK (password_r = 8),
    password_p integer NOT NULL CHECK (password_p = 1),
    password_salt bytea NOT NULL CHECK (octet_length(password_salt) = 16),
    password_hash bytea NOT NULL CHECK (octet_length(password_hash) = 64),
    auth_version bigint NOT NULL CHECK (auth_version > 0 AND auth_version <= 9007199254740991),
    created_at timestamptz(3) NOT NULL,
    password_changed_at timestamptz(3) NOT NULL
  )`.execute(db);
  await sql`CREATE TABLE tinywarden.login_throttle (
    singleton boolean PRIMARY KEY CHECK (singleton),
    window_started_at timestamptz(3) NOT NULL,
    attempts integer NOT NULL CHECK (attempts BETWEEN 0 AND 5)
  )`.execute(db);
  await sql`CREATE TABLE tinywarden.operator_sessions (
    id uuid PRIMARY KEY, operator_id uuid NOT NULL REFERENCES tinywarden.operators(id) ON DELETE RESTRICT,
    secret_digest bytea NOT NULL UNIQUE CHECK (octet_length(secret_digest) = 32),
    auth_version bigint NOT NULL CHECK (auth_version > 0 AND auth_version <= 9007199254740991),
    issued_at timestamptz(3) NOT NULL, last_seen_at timestamptz(3) NOT NULL,
    expires_at timestamptz(3) NOT NULL,
    CHECK (issued_at <= last_seen_at AND last_seen_at < expires_at)
  )`.execute(db);
  await sql`CREATE INDEX operator_sessions_owner_time ON tinywarden.operator_sessions(operator_id, issued_at, id)`.execute(db);
  await sql`CREATE TABLE tinywarden.hosts (
    id uuid PRIMARY KEY, label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 100),
    reported_hostname text NOT NULL CHECK (char_length(reported_hostname) BETWEEN 1 AND 253),
    os_id text NOT NULL CHECK (char_length(os_id) BETWEEN 1 AND 32),
    os_version text NOT NULL CHECK (char_length(os_version) BETWEEN 1 AND 64),
    architecture text NOT NULL CHECK (char_length(architecture) BETWEEN 1 AND 32),
    enrolled_agent_version text NOT NULL CHECK (char_length(enrolled_agent_version) BETWEEN 1 AND 64),
    created_at timestamptz(3) NOT NULL
  )`.execute(db);
  await sql`CREATE INDEX hosts_created_id ON tinywarden.hosts(created_at DESC, id DESC)`.execute(db);
  await sql`CREATE TABLE tinywarden.agents (
    id uuid PRIMARY KEY, host_id uuid NOT NULL UNIQUE REFERENCES tinywarden.hosts(id) ON DELETE RESTRICT,
    current_generation bigint NOT NULL CHECK (current_generation BETWEEN 1 AND 9007199254740991),
    enrolled_at timestamptz(3) NOT NULL, revoked_at timestamptz(3),
    heartbeat_interval_seconds integer NOT NULL CHECK (heartbeat_interval_seconds BETWEEN 10 AND 300),
    stale_after_seconds integer NOT NULL CHECK (stale_after_seconds BETWEEN 30 AND 3600
      AND stale_after_seconds >= 3 * heartbeat_interval_seconds)
  )`.execute(db);
  await sql`CREATE TABLE tinywarden.agent_credentials (
    id uuid PRIMARY KEY, agent_id uuid NOT NULL REFERENCES tinywarden.agents(id) ON DELETE RESTRICT,
    generation bigint NOT NULL CHECK (generation BETWEEN 1 AND 9007199254740991),
    secret_digest bytea NOT NULL UNIQUE CHECK (octet_length(secret_digest) = 32),
    created_at timestamptz(3) NOT NULL, revoked_at timestamptz(3),
    last_sequence bigint NOT NULL DEFAULT 0 CHECK (last_sequence BETWEEN 0 AND 9007199254740991),
    last_fingerprint bytea CHECK (last_fingerprint IS NULL OR octet_length(last_fingerprint) = 32),
    accepted_at timestamptz(3), sent_at timestamptz(3), agent_version text,
    UNIQUE (agent_id, generation),
    CHECK ((last_sequence = 0 AND last_fingerprint IS NULL AND accepted_at IS NULL
      AND sent_at IS NULL AND agent_version IS NULL) OR
      (last_sequence > 0 AND last_fingerprint IS NOT NULL AND accepted_at IS NOT NULL
      AND sent_at IS NOT NULL AND agent_version IS NOT NULL))
  )`.execute(db);
  await sql`CREATE UNIQUE INDEX one_active_credential ON tinywarden.agent_credentials(agent_id)
    WHERE revoked_at IS NULL`.execute(db);
  await sql`CREATE TABLE tinywarden.enrollment_tokens (
    id uuid PRIMARY KEY, secret_digest bytea NOT NULL UNIQUE CHECK (octet_length(secret_digest) = 32),
    issued_by uuid NOT NULL REFERENCES tinywarden.operators(id) ON DELETE RESTRICT,
    issuance_request_id uuid NOT NULL, issuance_fingerprint bytea NOT NULL
      CHECK (octet_length(issuance_fingerprint) = 32),
    label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 100),
    target_agent_id uuid REFERENCES tinywarden.agents(id) ON DELETE RESTRICT,
    expected_generation bigint, issued_at timestamptz(3) NOT NULL,
    expires_at timestamptz(3) NOT NULL, revoked_at timestamptz(3), consumed_at timestamptz(3),
    consumed_request_id uuid UNIQUE, consumed_fingerprint bytea
      CHECK (consumed_fingerprint IS NULL OR octet_length(consumed_fingerprint) = 32),
    consumed_credential_id uuid UNIQUE REFERENCES tinywarden.agent_credentials(id) ON DELETE RESTRICT,
    UNIQUE (issued_by, issuance_request_id),
    CHECK ((target_agent_id IS NULL AND expected_generation IS NULL) OR
      (target_agent_id IS NOT NULL AND expected_generation IS NOT NULL
        AND expected_generation BETWEEN 1 AND 9007199254740991)),
    CHECK (expires_at = issued_at + interval '15 minutes'),
    CHECK ((consumed_at IS NULL AND consumed_request_id IS NULL AND consumed_fingerprint IS NULL
      AND consumed_credential_id IS NULL) OR (consumed_at IS NOT NULL AND consumed_request_id IS NOT NULL
      AND consumed_fingerprint IS NOT NULL AND consumed_credential_id IS NOT NULL))
  )`.execute(db);
  await sql`CREATE INDEX enrollment_tokens_issuer_time ON tinywarden.enrollment_tokens(issued_by, issued_at)`.execute(db);
  await sql`CREATE INDEX enrollment_tokens_target ON tinywarden.enrollment_tokens(target_agent_id)`.execute(db);
  await sql`CREATE TABLE tinywarden.audit_events (
    id uuid PRIMARY KEY, occurred_at timestamptz(3) NOT NULL, action text NOT NULL,
    actor_kind text NOT NULL CHECK (actor_kind IN ('system','operator','agent')),
    operator_id uuid REFERENCES tinywarden.operators(id) ON DELETE RESTRICT,
    target_operator_id uuid REFERENCES tinywarden.operators(id) ON DELETE RESTRICT,
    agent_id uuid REFERENCES tinywarden.agents(id) ON DELETE RESTRICT,
    host_id uuid REFERENCES tinywarden.hosts(id) ON DELETE RESTRICT,
    token_id uuid REFERENCES tinywarden.enrollment_tokens(id) ON DELETE RESTRICT,
    correlation_id uuid NOT NULL, from_generation bigint, to_generation bigint, revoked boolean,
    CHECK ((actor_kind = 'system' AND operator_id IS NULL AND agent_id IS NULL) OR
      (actor_kind = 'operator' AND operator_id IS NOT NULL AND agent_id IS NULL) OR
      (actor_kind = 'agent' AND agent_id IS NOT NULL AND operator_id IS NULL))
  )`.execute(db);
  await sql`CREATE INDEX audit_events_time ON tinywarden.audit_events(occurred_at, id)`.execute(db);
  await sql`CREATE INDEX audit_events_operator ON tinywarden.audit_events(operator_id)`.execute(db);
  await sql`CREATE INDEX audit_events_target_operator ON tinywarden.audit_events(target_operator_id)`.execute(db);
  await sql`CREATE INDEX audit_events_agent ON tinywarden.audit_events(agent_id)`.execute(db);
  await sql`CREATE INDEX audit_events_host ON tinywarden.audit_events(host_id)`.execute(db);
  await sql`CREATE INDEX audit_events_token ON tinywarden.audit_events(token_id)`.execute(db);
  const target = await sql<{ name: string }>`SELECT current_database() AS name`.execute(db);
  await sql`REVOKE ALL ON DATABASE ${sql.id(target.rows[0]!.name)} FROM PUBLIC`.execute(db);
  await sql`REVOKE ALL ON SCHEMA public FROM PUBLIC`.execute(db);
  await sql`REVOKE ALL ON SCHEMA tinywarden FROM PUBLIC`.execute(db);
  await sql`REVOKE ALL ON ALL TABLES IN SCHEMA tinywarden FROM PUBLIC`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE tinywarden.audit_events, tinywarden.enrollment_tokens,
    tinywarden.agent_credentials, tinywarden.agents, tinywarden.hosts,
    tinywarden.operator_sessions, tinywarden.login_throttle, tinywarden.operators`.execute(db);
}
