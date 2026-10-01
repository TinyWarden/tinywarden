import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE TABLE tinywarden.notification_routes (
    id uuid PRIMARY KEY, fingerprint bytea NOT NULL CHECK (octet_length(fingerprint)=32),
    transport text NOT NULL CHECK (transport IN ('disabled','capture','smtp')),
    current boolean NOT NULL, paused boolean NOT NULL, created_at timestamptz(3) NOT NULL,
    scan_after uuid REFERENCES tinywarden.hosts(id) ON DELETE RESTRICT,
    last_invocation_at timestamptz(3), attempt_starts timestamptz(3)[] NOT NULL DEFAULT '{}',
    CHECK (cardinality(attempt_starts)<=30 AND array_position(attempt_starts,NULL) IS NULL)
  )`.execute(db);
  await sql`CREATE UNIQUE INDEX notification_current_route ON tinywarden.notification_routes(current) WHERE current`.execute(db);
  await sql`CREATE TABLE tinywarden.notification_cursors (
    id uuid PRIMARY KEY, route_id uuid NOT NULL REFERENCES tinywarden.notification_routes(id) ON DELETE RESTRICT,
    host_id uuid NOT NULL, agent_id uuid NOT NULL, generation bigint NOT NULL,
    subject_key text NOT NULL CHECK (subject_key IN ('contact','disk-local','package-updates','reboot-required','fstrim-status')),
    source_revision bigint NOT NULL CHECK (source_revision BETWEEN 0 AND 9007199254740991),
    policy_version bigint NOT NULL CHECK (policy_version BETWEEN 0 AND 9007199254740991),
    current boolean NOT NULL, sampled_at timestamptz(3) NOT NULL,
    last_state text CHECK (last_state IN ('healthy','warning','critical','offline')),
    suspended boolean NOT NULL, exposed boolean NOT NULL,
    transition_number bigint NOT NULL CHECK (transition_number BETWEEN 0 AND 9007199254740991),
    UNIQUE (id,route_id),
    FOREIGN KEY (host_id,agent_id) REFERENCES tinywarden.agents(host_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (agent_id,generation) REFERENCES tinywarden.agent_credentials(agent_id,generation) ON DELETE RESTRICT,
    CHECK ((subject_key='contact' AND source_revision=0 AND policy_version=0)
      OR (subject_key<>'contact' AND source_revision>=1)),
    CHECK (last_state IS NULL OR subject_key='contact' AND last_state IN ('healthy','offline')
      OR subject_key='disk-local' AND last_state IN ('healthy','warning','critical')
      OR subject_key NOT IN ('contact','disk-local') AND last_state IN ('healthy','warning'))
  )`.execute(db);
  await sql`CREATE UNIQUE INDEX notification_current_subject ON tinywarden.notification_cursors(route_id,host_id,subject_key) WHERE current`.execute(db);
  await sql`CREATE TABLE tinywarden.notification_outbox (
    id uuid PRIMARY KEY, route_id uuid NOT NULL, cursor_id uuid NOT NULL,
    transition_number bigint NOT NULL CHECK (transition_number BETWEEN 1 AND 9007199254740991),
    from_state text CHECK (from_state IN ('healthy','warning','critical','offline')),
    to_state text NOT NULL CHECK (to_state IN ('healthy','warning','critical','offline')),
    sampled_at timestamptz(3) NOT NULL, created_at timestamptz(3) NOT NULL,
    template_version integer NOT NULL CHECK (template_version=1),
    state text NOT NULL CHECK (state IN ('pending','in_flight','accepted','captured','failed','uncertain','cancelled','expired')),
    attempts integer NOT NULL CHECK (attempts BETWEEN 0 AND 3),
    next_attempt_at timestamptz(3) NOT NULL, attempt_id uuid,
    started_at timestamptz(3), finished_at timestamptz(3),
    outcome text CHECK (outcome ~ '^[a-z_]{1,48}$'), acknowledged_at timestamptz(3),
    UNIQUE (cursor_id,transition_number), UNIQUE (id,route_id),
    FOREIGN KEY (cursor_id,route_id) REFERENCES tinywarden.notification_cursors(id,route_id) ON DELETE RESTRICT,
    CHECK ((attempts=0 AND attempt_id IS NULL AND started_at IS NULL)
      OR (attempts>0 AND attempt_id IS NOT NULL AND started_at IS NOT NULL)),
    CHECK (state NOT IN ('in_flight','accepted','captured','failed','uncertain') OR attempts>0),
    CHECK (state<>'in_flight' OR finished_at IS NULL),
    CHECK (acknowledged_at IS NULL OR state='uncertain')
  )`.execute(db);
  await sql`CREATE INDEX notification_due ON tinywarden.notification_outbox(route_id,next_attempt_at,created_at,id) WHERE state='pending'`.execute(db);
  await sql`CREATE UNIQUE INDEX notification_one_pending ON tinywarden.notification_outbox(cursor_id) WHERE state IN ('pending','in_flight')`.execute(db);
  await sql`CREATE INDEX notification_outbox_cursor ON tinywarden.notification_outbox(cursor_id,state)`.execute(db);
  await sql`ALTER TABLE tinywarden.audit_events
    ADD COLUMN notification_route uuid REFERENCES tinywarden.notification_routes(id) ON DELETE RESTRICT,
    ADD COLUMN notification_event uuid REFERENCES tinywarden.notification_outbox(id) ON DELETE RESTRICT,
    ADD COLUMN notification_attempt uuid,
    ADD COLUMN notification_outcome text,
    ADD CONSTRAINT audit_notification_scope FOREIGN KEY (notification_event,notification_route)
      REFERENCES tinywarden.notification_outbox(id,route_id) ON DELETE RESTRICT,
    ADD CONSTRAINT audit_notification_shape CHECK (
      (action IN ('notification.route_configured','notification.queued','notification.attempt_started',
        'notification.attempt_finished','notification.closed','notification.acknowledged')
        AND actor_kind='system' AND notification_route IS NOT NULL
        AND notification_outcome IS NOT NULL AND notification_outcome ~ '^[a-z_]{1,48}$'
        AND operator_id IS NULL AND agent_id IS NULL AND target_operator_id IS NULL
        AND target_agent_id IS NULL AND host_id IS NULL AND token_id IS NULL
        AND from_generation IS NULL AND to_generation IS NULL AND revoked IS NULL
        AND definition_key IS NULL AND from_definition_revision IS NULL AND to_definition_revision IS NULL
        AND from_policy_version IS NULL AND to_policy_version IS NULL
        AND baseline_key IS NULL AND from_baseline_revision IS NULL AND to_baseline_revision IS NULL
        AND from_baseline_policy IS NULL AND to_baseline_policy IS NULL
        AND (action='notification.route_configured' AND notification_event IS NULL AND notification_attempt IS NULL
          OR action IN ('notification.queued','notification.closed','notification.acknowledged')
            AND notification_event IS NOT NULL AND notification_attempt IS NULL
          OR action IN ('notification.attempt_started','notification.attempt_finished')
            AND notification_event IS NOT NULL AND notification_attempt IS NOT NULL))
      OR (action NOT IN ('notification.route_configured','notification.queued','notification.attempt_started',
        'notification.attempt_finished','notification.closed','notification.acknowledged')
        AND notification_route IS NULL AND notification_event IS NULL
        AND notification_attempt IS NULL AND notification_outcome IS NULL))`.execute(db);
  for (const name of ["notification_routes", "notification_cursors", "notification_outbox"]) {
    await sql`REVOKE ALL ON ${sql.raw(`tinywarden.${name}`)} FROM PUBLIC`.execute(db);
  }
}
export async function down(): Promise<void> { throw new Error("notifications_require_forward_repair"); }
