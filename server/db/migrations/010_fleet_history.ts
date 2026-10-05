import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE tinywarden.baseline_runs ADD COLUMN assessment_version integer
    NOT NULL DEFAULT 1 CHECK (assessment_version IN (1,2))`.execute(db);
  await sql`CREATE TABLE tinywarden.history_control (
    singleton boolean PRIMARY KEY CHECK (singleton), epoch uuid NOT NULL,
    activated_at timestamptz(3) NOT NULL, scan_after uuid,
    scan_started_at timestamptz(3), scan_completed_at timestamptz(3), last_invocation_at timestamptz(3)
  )`.execute(db);
  await sql`CREATE TABLE tinywarden.history_subjects (
    id uuid PRIMARY KEY, host_id uuid NOT NULL REFERENCES tinywarden.hosts(id) ON DELETE RESTRICT,
    subject_key text NOT NULL CHECK (subject_key IN ('contact','disk-local','package-updates','reboot-required','fstrim-status')),
    epoch uuid NOT NULL, agent_id uuid, generation bigint CHECK (generation BETWEEN 1 AND 9007199254740991),
    source_revision bigint NOT NULL CHECK (source_revision BETWEEN 0 AND 9007199254740991),
    policy_version bigint NOT NULL CHECK (policy_version BETWEEN 0 AND 9007199254740991),
    assessment_version integer CHECK (assessment_version IN (1,2)),
    state text NOT NULL CHECK (state IN ('healthy','warning','critical','unknown','stale','offline')),
    reason text NOT NULL CHECK (reason ~ '^[a-z_]{1,80}$'),
    first_seen_at timestamptz(3) NOT NULL, continuous_since timestamptz(3),
    last_sample_at timestamptz(3) NOT NULL, measured_at timestamptz(3), facts jsonb,
    suspended boolean NOT NULL, transition_number bigint NOT NULL CHECK (transition_number BETWEEN 0 AND 9007199254740991),
    UNIQUE (host_id,subject_key), UNIQUE(id,host_id,subject_key),
    FOREIGN KEY (host_id,agent_id) REFERENCES tinywarden.agents(host_id,id) ON DELETE RESTRICT,
    CHECK ((agent_id IS NULL) = (generation IS NULL)),
    CHECK (first_seen_at <= last_sample_at AND (continuous_since IS NULL OR continuous_since <= last_sample_at)),
    CHECK (facts IS NULL OR jsonb_typeof(facts)='object' AND octet_length(facts::text)<=8192)
  )`.execute(db);
  await sql`CREATE INDEX history_subjects_expiry ON tinywarden.history_subjects(last_sample_at,id) WHERE facts IS NOT NULL`.execute(db);
  await sql`CREATE TABLE tinywarden.history_events (
    id uuid PRIMARY KEY, cursor_id uuid NOT NULL, transition_number bigint NOT NULL
      CHECK (transition_number BETWEEN 1 AND 9007199254740991), epoch uuid NOT NULL,
    host_id uuid NOT NULL REFERENCES tinywarden.hosts(id) ON DELETE RESTRICT,
    subject_key text NOT NULL CHECK (subject_key IN ('contact','disk-local','package-updates','reboot-required','fstrim-status')),
    agent_id uuid, generation bigint CHECK (generation BETWEEN 1 AND 9007199254740991),
    source_revision bigint NOT NULL CHECK (source_revision BETWEEN 0 AND 9007199254740991),
    policy_version bigint NOT NULL CHECK (policy_version BETWEEN 0 AND 9007199254740991),
    assessment_version integer CHECK (assessment_version IN (1,2)),
    kind text NOT NULL CHECK (kind IN ('state','context','gap')),
    from_state text CHECK (from_state IN ('healthy','warning','critical','unknown','stale','offline')),
    to_state text NOT NULL CHECK (to_state IN ('healthy','warning','critical','unknown','stale','offline')),
    from_reason text CHECK (from_reason ~ '^[a-z_]{1,80}$'),
    to_reason text NOT NULL CHECK (to_reason ~ '^[a-z_]{1,80}$'),
    previous_sample_at timestamptz(3), observed_at timestamptz(3) NOT NULL,
    measured_at timestamptz(3), after_gap boolean NOT NULL,
    previous_scope jsonb, before_facts jsonb, after_facts jsonb,
    UNIQUE(epoch,cursor_id,transition_number),
    FOREIGN KEY (cursor_id,host_id,subject_key) REFERENCES tinywarden.history_subjects(id,host_id,subject_key) ON DELETE RESTRICT,
    FOREIGN KEY (host_id,agent_id) REFERENCES tinywarden.agents(host_id,id) ON DELETE RESTRICT,
    CHECK ((agent_id IS NULL) = (generation IS NULL)),
    CHECK (previous_sample_at IS NULL OR previous_sample_at <= observed_at),
    CHECK (previous_scope IS NULL OR jsonb_typeof(previous_scope)='object' AND octet_length(previous_scope::text)<=1024),
    CHECK (before_facts IS NULL OR jsonb_typeof(before_facts)='object' AND octet_length(before_facts::text)<=8192),
    CHECK (after_facts IS NULL OR jsonb_typeof(after_facts)='object' AND octet_length(after_facts::text)<=8192)
  )`.execute(db);
  await sql`CREATE INDEX history_events_order ON tinywarden.history_events(observed_at DESC,id DESC)`.execute(db);
  await sql`CREATE INDEX history_events_host ON tinywarden.history_events(host_id,observed_at DESC,id DESC)`.execute(db);
  await sql`CREATE INDEX history_events_subject ON tinywarden.history_events(cursor_id)`.execute(db);
  await sql`ALTER TABLE tinywarden.audit_events DROP CONSTRAINT audit_retention_shape`.execute(db);
  await sql`ALTER TABLE tinywarden.audit_events ADD CONSTRAINT audit_retention_shape CHECK (
    (action='observation.retention_pruned' AND actor_kind='system'
      AND operator_id IS NULL AND agent_id IS NULL AND target_operator_id IS NULL
      AND target_agent_id IS NULL AND host_id IS NULL AND token_id IS NULL
      AND from_generation IS NULL AND to_generation IS NULL AND revoked IS NULL
      AND definition_key IS NULL AND from_definition_revision IS NULL AND to_definition_revision IS NULL
      AND from_policy_version IS NULL AND to_policy_version IS NULL
      AND baseline_key IS NULL AND from_baseline_revision IS NULL AND to_baseline_revision IS NULL
      AND from_baseline_policy IS NULL AND to_baseline_policy IS NULL
      AND retention_family IS NOT NULL AND retention_family IN ('disk','baseline','history')
      AND retention_cutoff IS NOT NULL AND retention_days IS NOT NULL AND retention_days=90
      AND retention_parent_count IS NOT NULL AND retention_parent_count BETWEEN 1 AND 100
      AND retention_mount_count IS NOT NULL AND retention_mount_count BETWEEN 0 AND 12800
      AND (retention_family='disk' OR retention_mount_count=0))
    OR (action<>'observation.retention_pruned' AND retention_family IS NULL
      AND retention_cutoff IS NULL AND retention_days IS NULL
      AND retention_parent_count IS NULL AND retention_mount_count IS NULL))`.execute(db);
  for (const table of ["history_control", "history_subjects", "history_events"]) {
    await sql`REVOKE ALL ON ${sql.raw(`tinywarden.${table}`)} FROM PUBLIC`.execute(db);
  }
}
export async function down(): Promise<void> { throw new Error("fleet_history_requires_forward_repair"); }
