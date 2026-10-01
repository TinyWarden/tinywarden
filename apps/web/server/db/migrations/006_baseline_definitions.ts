import { sql, type Kysely } from "kysely";

// Historical additive schema/seed. Never import future recipe builders here.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE TABLE tinywarden.baseline_definitions (
    definition_key text PRIMARY KEY CHECK (definition_key IN ('package-updates','reboot-required','fstrim-status')),
    current_revision bigint NOT NULL CHECK (current_revision BETWEEN 1 AND 9007199254740991)
  )`.execute(db);
  await sql`CREATE TABLE tinywarden.baseline_definition_revisions (
    definition_key text NOT NULL REFERENCES tinywarden.baseline_definitions ON DELETE RESTRICT,
    revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    normalizer text NOT NULL CHECK (length(normalizer) BETWEEN 1 AND 64),
    evaluator text NOT NULL CHECK (length(evaluator) BETWEEN 1 AND 64),
    interval_seconds integer NOT NULL CHECK (interval_seconds BETWEEN 300 AND 86400),
    timeout_seconds integer NOT NULL CHECK (timeout_seconds BETWEEN 1 AND 30),
    package_mode text NOT NULL CHECK (package_mode='upgrade' OR
      (definition_key='package-updates' AND package_mode='with-new-pkgs')),
    recipe jsonb NOT NULL CHECK (jsonb_typeof(recipe)='object' AND octet_length(recipe::text)<=8192),
    created_at timestamptz(3) NOT NULL, PRIMARY KEY (definition_key,revision)
  )`.execute(db);
  await sql`ALTER TABLE tinywarden.baseline_definitions ADD CONSTRAINT baseline_current_revision_fk
    FOREIGN KEY (definition_key,current_revision)
    REFERENCES tinywarden.baseline_definition_revisions(definition_key,revision)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED`.execute(db);
  await sql`CREATE TABLE tinywarden.baseline_policies (
    host_id uuid NOT NULL REFERENCES tinywarden.hosts ON DELETE RESTRICT,
    definition_key text NOT NULL REFERENCES tinywarden.baseline_definitions ON DELETE RESTRICT,
    current_policy_version bigint NOT NULL CHECK (current_policy_version BETWEEN 0 AND 9007199254740991),
    last_delivery_revision bigint NOT NULL DEFAULT 0 CHECK (last_delivery_revision BETWEEN 0 AND 9007199254740991),
    PRIMARY KEY (host_id,definition_key)
  )`.execute(db);
  await sql`CREATE TABLE tinywarden.baseline_policy_revisions (
    host_id uuid NOT NULL, definition_key text NOT NULL,
    version bigint NOT NULL CHECK (version BETWEEN 0 AND 9007199254740991),
    mode text NOT NULL CHECK (mode IN ('inherit','override')),
    interval_seconds integer, timeout_seconds integer, package_mode text,
    pinned_definition_revision bigint, created_at timestamptz(3) NOT NULL,
    PRIMARY KEY (host_id,definition_key,version),
    FOREIGN KEY (host_id,definition_key) REFERENCES tinywarden.baseline_policies ON DELETE RESTRICT,
    FOREIGN KEY (definition_key,pinned_definition_revision)
      REFERENCES tinywarden.baseline_definition_revisions(definition_key,revision) ON DELETE RESTRICT,
    CHECK ((mode='inherit' AND interval_seconds IS NULL AND timeout_seconds IS NULL
      AND package_mode IS NULL AND pinned_definition_revision IS NULL) OR
      (mode='override' AND interval_seconds IS NOT NULL AND interval_seconds BETWEEN 300 AND 86400
      AND timeout_seconds IS NOT NULL AND timeout_seconds BETWEEN 1 AND 30
      AND package_mode IS NOT NULL AND (package_mode='upgrade' OR
        (definition_key='package-updates' AND package_mode='with-new-pkgs'))
      AND pinned_definition_revision IS NOT NULL))
  )`.execute(db);
  await sql`ALTER TABLE tinywarden.baseline_policies ADD CONSTRAINT baseline_current_policy_fk
    FOREIGN KEY (host_id,definition_key,current_policy_version)
    REFERENCES tinywarden.baseline_policy_revisions(host_id,definition_key,version)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED`.execute(db);
  await sql`CREATE INDEX baseline_policy_source ON tinywarden.baseline_policy_revisions(definition_key,pinned_definition_revision)`.execute(db);
  await sql`CREATE INDEX baseline_policy_key ON tinywarden.baseline_policies(definition_key)`.execute(db);
  await sql`CREATE TABLE tinywarden.baseline_snapshots (
    id uuid PRIMARY KEY, host_id uuid NOT NULL, agent_id uuid NOT NULL,
    generation bigint NOT NULL CHECK (generation BETWEEN 1 AND 9007199254740991),
    definition_key text NOT NULL, revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    definition_revision bigint NOT NULL, policy_version bigint NOT NULL,
    mode text NOT NULL CHECK (mode IN ('inherit','override')),
    applicability text NOT NULL CHECK (applicability IN ('ready','unsupported_os','unsupported_architecture','missing_capability')),
    normalizer text NOT NULL, evaluator text NOT NULL,
    interval_seconds integer NOT NULL CHECK (interval_seconds BETWEEN 300 AND 86400),
    timeout_seconds integer NOT NULL CHECK (timeout_seconds BETWEEN 1 AND 30),
    package_mode text NOT NULL CHECK (package_mode='upgrade' OR (definition_key='package-updates' AND package_mode='with-new-pkgs')),
    recipe jsonb NOT NULL CHECK (jsonb_typeof(recipe)='object' AND octet_length(recipe::text)<=8192),
    created_at timestamptz(3) NOT NULL,
    payload_digest bytea NOT NULL CHECK (octet_length(payload_digest)=32),
    UNIQUE (host_id,definition_key,revision), UNIQUE (id,host_id,agent_id,generation,definition_key),
    FOREIGN KEY (host_id,agent_id) REFERENCES tinywarden.agents(host_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (agent_id,generation) REFERENCES tinywarden.agent_credentials(agent_id,generation) ON DELETE RESTRICT,
    FOREIGN KEY (definition_key,definition_revision) REFERENCES tinywarden.baseline_definition_revisions ON DELETE RESTRICT,
    FOREIGN KEY (host_id,definition_key,policy_version) REFERENCES tinywarden.baseline_policy_revisions ON DELETE RESTRICT
  )`.execute(db);
  await sql`CREATE INDEX baseline_snapshot_scope ON tinywarden.baseline_snapshots(agent_id,generation)`.execute(db);
  await sql`CREATE INDEX baseline_snapshot_source ON tinywarden.baseline_snapshots(definition_key,definition_revision)`.execute(db);
  await sql`CREATE INDEX baseline_snapshot_policy ON tinywarden.baseline_snapshots(host_id,definition_key,policy_version)`.execute(db);
  await sql`CREATE TABLE tinywarden.baseline_receipts (
    operator_id uuid NOT NULL REFERENCES tinywarden.operators ON DELETE RESTRICT, request_id uuid NOT NULL,
    root text NOT NULL CHECK (root IN ('UpdateBaselineDefinition','SetBaselinePolicy')),
    definition_key text NOT NULL REFERENCES tinywarden.baseline_definitions ON DELETE RESTRICT,
    host_id uuid REFERENCES tinywarden.hosts ON DELETE RESTRICT,
    request_fingerprint bytea NOT NULL CHECK (octet_length(request_fingerprint)=32), changed boolean NOT NULL,
    resulting_definition_revision bigint, resulting_policy_version bigint, completed_at timestamptz(3) NOT NULL,
    PRIMARY KEY (operator_id,request_id),
    FOREIGN KEY (definition_key,resulting_definition_revision) REFERENCES tinywarden.baseline_definition_revisions ON DELETE RESTRICT,
    FOREIGN KEY (host_id,definition_key,resulting_policy_version) REFERENCES tinywarden.baseline_policy_revisions ON DELETE RESTRICT,
    CHECK ((root='UpdateBaselineDefinition' AND host_id IS NULL AND resulting_definition_revision IS NOT NULL AND resulting_policy_version IS NULL)
      OR (root='SetBaselinePolicy' AND host_id IS NOT NULL AND resulting_definition_revision IS NULL AND resulting_policy_version IS NOT NULL))
  )`.execute(db);
  await sql`CREATE INDEX baseline_receipt_source ON tinywarden.baseline_receipts(definition_key,resulting_definition_revision)`.execute(db);
  await sql`CREATE INDEX baseline_receipt_policy ON tinywarden.baseline_receipts(host_id,definition_key,resulting_policy_version)`.execute(db);
  await sql`ALTER TABLE tinywarden.audit_events
    ADD COLUMN baseline_key text REFERENCES tinywarden.baseline_definitions ON DELETE RESTRICT,
    ADD COLUMN from_baseline_revision bigint, ADD COLUMN to_baseline_revision bigint,
    ADD COLUMN from_baseline_policy bigint, ADD COLUMN to_baseline_policy bigint,
    ADD CONSTRAINT audit_baseline_from_revision FOREIGN KEY (baseline_key,from_baseline_revision) REFERENCES tinywarden.baseline_definition_revisions,
    ADD CONSTRAINT audit_baseline_to_revision FOREIGN KEY (baseline_key,to_baseline_revision) REFERENCES tinywarden.baseline_definition_revisions,
    ADD CONSTRAINT audit_baseline_from_policy FOREIGN KEY (host_id,baseline_key,from_baseline_policy) REFERENCES tinywarden.baseline_policy_revisions,
    ADD CONSTRAINT audit_baseline_to_policy FOREIGN KEY (host_id,baseline_key,to_baseline_policy) REFERENCES tinywarden.baseline_policy_revisions,
    ADD CONSTRAINT audit_baseline_shape CHECK (
      (action='baseline.definition_initialized' AND actor_kind='system' AND baseline_key IS NOT NULL
        AND from_baseline_revision IS NULL AND to_baseline_revision IS NOT NULL AND to_baseline_revision=1 AND host_id IS NULL
        AND from_baseline_policy IS NULL AND to_baseline_policy IS NULL) OR
      (action='baseline.definition_updated' AND actor_kind='operator' AND baseline_key IS NOT NULL
        AND from_baseline_revision IS NOT NULL AND to_baseline_revision IS NOT NULL AND to_baseline_revision=from_baseline_revision+1
        AND host_id IS NULL AND from_baseline_policy IS NULL AND to_baseline_policy IS NULL) OR
      (action='baseline.policy_updated' AND actor_kind='operator' AND baseline_key IS NOT NULL
        AND host_id IS NOT NULL AND from_baseline_policy IS NOT NULL AND to_baseline_policy IS NOT NULL AND to_baseline_policy=from_baseline_policy+1
        AND from_baseline_revision IS NULL AND to_baseline_revision IS NULL) OR
      (action NOT IN ('baseline.definition_initialized','baseline.definition_updated','baseline.policy_updated')
        AND baseline_key IS NULL AND from_baseline_revision IS NULL AND to_baseline_revision IS NULL
        AND from_baseline_policy IS NULL AND to_baseline_policy IS NULL))`.execute(db);
  await sql`CREATE INDEX audit_baseline_revision_from ON tinywarden.audit_events(baseline_key,from_baseline_revision)`.execute(db);
  await sql`CREATE INDEX audit_baseline_revision_to ON tinywarden.audit_events(baseline_key,to_baseline_revision)`.execute(db);
  await sql`CREATE INDEX audit_baseline_policy_from ON tinywarden.audit_events(host_id,baseline_key,from_baseline_policy)`.execute(db);
  await sql`CREATE INDEX audit_baseline_policy_to ON tinywarden.audit_events(host_id,baseline_key,to_baseline_policy)`.execute(db);
  const seeds = [
    { key: "package-updates", normalizer: "apt-plan.debian13.v1", evaluator: "package-plan.v1", timeout: 30,
      steps: [{ step_id: "apt", profile: "apt-upgrade.v1", argv: ["--simulate", "upgrade"] }] },
    { key: "reboot-required", normalizer: "reboot-marker.debian13.v1", evaluator: "reboot-marker.v1", timeout: 10,
      steps: [{ step_id: "marker", profile: "reboot-marker.v1", argv: ["-e", "/run/reboot-required"] }] },
    { key: "fstrim-status", normalizer: "fstrim-systemd.debian13.v1", evaluator: "fstrim-systemd.v1", timeout: 10,
      steps: [
        { step_id: "timer", profile: "fstrim-timer.v1", argv: ["--system", "--no-pager", "--no-ask-password", "--all", "--timestamp=unix", "show",
          "--property=Id,LoadState,ActiveState,UnitFileState,LastTriggerUSec,NextElapseUSecRealtime,ConditionResult,ConditionTimestamp", "fstrim.timer"] },
        { step_id: "service", profile: "fstrim-service.v1", argv: ["--system", "--no-pager", "--no-ask-password", "--all", "--timestamp=unix", "show",
          "--property=Id,LoadState,ActiveState,Result,ExecMainCode,ExecMainStatus,ExecMainStartTimestamp,ExecMainExitTimestamp,ConditionResult,ConditionTimestamp", "fstrim.service"] },
      ] },
  ];
  for (const seed of seeds) {
    const recipe = JSON.stringify({ schema_version: 1, capability: "exec_observe.debian13.v1",
      policy_version: 1, timeout_seconds: seed.timeout, steps: seed.steps });
    await sql`INSERT INTO tinywarden.baseline_definitions VALUES (${seed.key},1)`.execute(db);
    await sql`INSERT INTO tinywarden.baseline_definition_revisions VALUES
      (${seed.key},1,${seed.normalizer},${seed.evaluator},3600,${seed.timeout},'upgrade',${recipe}::jsonb,
      date_trunc('milliseconds',clock_timestamp()))`.execute(db);
    await sql`INSERT INTO tinywarden.audit_events(id,occurred_at,action,actor_kind,correlation_id,baseline_key,to_baseline_revision)
      VALUES (gen_random_uuid(),date_trunc('milliseconds',clock_timestamp()),'baseline.definition_initialized',
      'system',gen_random_uuid(),${seed.key},1)`.execute(db);
  }
  await sql`REVOKE ALL ON tinywarden.baseline_definitions,tinywarden.baseline_definition_revisions,
    tinywarden.baseline_policies,tinywarden.baseline_policy_revisions,tinywarden.baseline_snapshots,tinywarden.baseline_receipts FROM PUBLIC`.execute(db);
}
export async function down(): Promise<void> { throw new Error("baseline_history_requires_forward_repair"); }
