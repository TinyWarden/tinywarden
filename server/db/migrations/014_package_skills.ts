import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE TABLE tinywarden.skill_packages (
    content_sha256 text PRIMARY KEY CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
    skill_id text NOT NULL CHECK (skill_id ~ '^[a-z][a-z0-9-]{0,63}/[a-z][a-z0-9-]{0,63}$'),
    version text NOT NULL CHECK (version ~ '^[0-9]+[.][0-9]+[.][0-9]+$'),
    metadata jsonb NOT NULL CHECK (jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=524288),
    unpacked_bytes integer NOT NULL CHECK (unpacked_bytes BETWEEN 1 AND 20971520),
    official boolean NOT NULL, imported_at timestamptz(3) NOT NULL,
    UNIQUE(skill_id,version), UNIQUE(content_sha256,skill_id)
  )`.execute(db);
  await sql`CREATE TABLE tinywarden.skill_installations (
    id uuid PRIMARY KEY, skill_id text NOT NULL UNIQUE,
    subject_key text NOT NULL UNIQUE CHECK (subject_key ~ '^[a-z][a-z0-9/-]{0,128}$' AND subject_key<>'contact'),
    content_sha256 text NOT NULL, enabled boolean NOT NULL,
    enablement_version bigint NOT NULL CHECK (enablement_version BETWEEN 1 AND 9007199254740991),
    settings_revision bigint NOT NULL CHECK (settings_revision BETWEEN 1 AND 9007199254740991),
    defaults jsonb NOT NULL CHECK (jsonb_typeof(defaults)='object' AND octet_length(defaults::text)<=65536),
    grants jsonb NOT NULL CHECK (jsonb_typeof(grants)='array' AND octet_length(grants::text)<=65536),
    created_at timestamptz(3) NOT NULL, updated_at timestamptz(3) NOT NULL CHECK (updated_at>=created_at),
    FOREIGN KEY (content_sha256,skill_id) REFERENCES tinywarden.skill_packages(content_sha256,skill_id) ON DELETE RESTRICT
  )`.execute(db);
  await sql`CREATE INDEX skill_installations_package ON tinywarden.skill_installations(content_sha256)`.execute(db);
  await sql`CREATE TABLE tinywarden.skill_settings_revisions (
    installation_id uuid NOT NULL REFERENCES tinywarden.skill_installations(id) ON DELETE RESTRICT,
    revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    content_sha256 text NOT NULL REFERENCES tinywarden.skill_packages(content_sha256) ON DELETE RESTRICT,
    settings jsonb NOT NULL CHECK (jsonb_typeof(settings)='object' AND octet_length(settings::text)<=65536),
    operator_id uuid NOT NULL REFERENCES tinywarden.operators(id) ON DELETE RESTRICT,
    created_at timestamptz(3) NOT NULL, PRIMARY KEY(installation_id,revision)
  )`.execute(db);
  await sql`CREATE INDEX skill_settings_package ON tinywarden.skill_settings_revisions(content_sha256)`.execute(db);
  await sql`CREATE INDEX skill_settings_operator ON tinywarden.skill_settings_revisions(operator_id)`.execute(db);
  await sql`CREATE TABLE tinywarden.host_skill_policies (
    host_id uuid NOT NULL REFERENCES tinywarden.hosts(id) ON DELETE RESTRICT,
    installation_id uuid NOT NULL REFERENCES tinywarden.skill_installations(id) ON DELETE RESTRICT,
    version bigint NOT NULL CHECK (version BETWEEN 1 AND 9007199254740991),
    overrides jsonb NOT NULL CHECK (jsonb_typeof(overrides)='object' AND octet_length(overrides::text)<=65536),
    updated_at timestamptz(3) NOT NULL, PRIMARY KEY(host_id,installation_id)
  )`.execute(db);
  await sql`CREATE INDEX host_skill_installation ON tinywarden.host_skill_policies(installation_id)`.execute(db);
  await sql`CREATE TABLE tinywarden.host_skill_policy_revisions (
    host_id uuid NOT NULL REFERENCES tinywarden.hosts(id) ON DELETE RESTRICT,
    installation_id uuid NOT NULL REFERENCES tinywarden.skill_installations(id) ON DELETE RESTRICT,
    version bigint NOT NULL CHECK (version BETWEEN 1 AND 9007199254740991),
    overrides jsonb NOT NULL CHECK (jsonb_typeof(overrides)='object' AND octet_length(overrides::text)<=65536),
    operator_id uuid NOT NULL REFERENCES tinywarden.operators(id) ON DELETE RESTRICT,
    updated_at timestamptz(3) NOT NULL, PRIMARY KEY(host_id,installation_id,version)
  )`.execute(db);
  await sql`CREATE INDEX skill_policy_installation ON tinywarden.host_skill_policy_revisions(installation_id)`.execute(db);
  await sql`CREATE INDEX skill_policy_operator ON tinywarden.host_skill_policy_revisions(operator_id)`.execute(db);
  await sql`CREATE TABLE tinywarden.skill_assignments (
    id uuid PRIMARY KEY, host_id uuid NOT NULL, agent_id uuid NOT NULL, generation bigint NOT NULL,
    installation_id uuid NOT NULL REFERENCES tinywarden.skill_installations(id) ON DELETE RESTRICT,
    content_sha256 text NOT NULL REFERENCES tinywarden.skill_packages(content_sha256) ON DELETE RESTRICT,
    enablement_version bigint NOT NULL, settings_revision bigint NOT NULL, policy_version bigint NOT NULL,
    settings jsonb NOT NULL CHECK (jsonb_typeof(settings)='object' AND octet_length(settings::text)<=65536),
    grants jsonb NOT NULL CHECK (jsonb_typeof(grants)='array' AND octet_length(grants::text)<=65536),
    interval_seconds integer NOT NULL CHECK (interval_seconds BETWEEN 60 AND 86400),
    created_at timestamptz(3) NOT NULL, valid_until timestamptz(3) NOT NULL CHECK(valid_until>created_at),
    FOREIGN KEY(host_id,agent_id) REFERENCES tinywarden.agents(host_id,id) ON DELETE RESTRICT,
    FOREIGN KEY(agent_id,generation) REFERENCES tinywarden.agent_credentials(agent_id,generation) ON DELETE RESTRICT,
    FOREIGN KEY(installation_id,settings_revision) REFERENCES tinywarden.skill_settings_revisions(installation_id,revision) ON DELETE RESTRICT,
    UNIQUE(id,installation_id,host_id,agent_id,generation,content_sha256)
  )`.execute(db);
  await sql`CREATE INDEX skill_assignment_current ON tinywarden.skill_assignments(host_id,installation_id,created_at DESC,id DESC)`.execute(db);
  await sql`CREATE INDEX skill_assignment_agent ON tinywarden.skill_assignments(agent_id,generation)`.execute(db);
  await sql`CREATE INDEX skill_assignment_installation ON tinywarden.skill_assignments(installation_id,settings_revision)`.execute(db);
  await sql`CREATE INDEX skill_assignment_package ON tinywarden.skill_assignments(content_sha256)`.execute(db);
  await sql`CREATE TABLE tinywarden.skill_observations (
    id uuid PRIMARY KEY, assignment_id uuid NOT NULL, installation_id uuid NOT NULL, host_id uuid NOT NULL,
    agent_id uuid NOT NULL, generation bigint NOT NULL, content_sha256 text NOT NULL,
    run_sequence bigint NOT NULL CHECK (run_sequence BETWEEN 1 AND 9007199254740991),
    started_at timestamptz(3) NOT NULL, finished_at timestamptz(3) NOT NULL CHECK(finished_at>=started_at),
    received_at timestamptz(3) NOT NULL, evidence_expires_at timestamptz(3) NOT NULL,
    observation jsonb CHECK (observation IS NULL OR octet_length(observation::text)<=1048576),
    outcome text NOT NULL CHECK(outcome ~ '^[a-z_]{1,80}$'),
    assessments jsonb NOT NULL CHECK(jsonb_typeof(assessments)='array' AND octet_length(assessments::text)<=524288),
    request_digest bytea NOT NULL CHECK(octet_length(request_digest)=32), current boolean NOT NULL,
    FOREIGN KEY(assignment_id,installation_id,host_id,agent_id,generation,content_sha256)
      REFERENCES tinywarden.skill_assignments(id,installation_id,host_id,agent_id,generation,content_sha256) ON DELETE RESTRICT,
    UNIQUE(agent_id,generation,installation_id,run_sequence)
  )`.execute(db);
  await sql`CREATE INDEX skill_observation_latest ON tinywarden.skill_observations(host_id,installation_id,finished_at DESC,run_sequence DESC)`.execute(db);
  await sql`CREATE INDEX skill_observation_assignment ON tinywarden.skill_observations(assignment_id)`.execute(db);
  await sql`CREATE INDEX skill_observation_expiry ON tinywarden.skill_observations(received_at,id)`.execute(db);
  await sql`CREATE TABLE tinywarden.skill_states (
    installation_id uuid NOT NULL REFERENCES tinywarden.skill_installations(id) ON DELETE RESTRICT,
    agent_id uuid NOT NULL, host_id uuid NOT NULL, generation bigint NOT NULL,
    content_sha256 text NOT NULL REFERENCES tinywarden.skill_packages(content_sha256) ON DELETE RESTRICT,
    enablement_version bigint NOT NULL, state_version integer NOT NULL CHECK(state_version BETWEEN 1 AND 65535),
    last_sequence bigint NOT NULL CHECK(last_sequence BETWEEN 0 AND 9007199254740991),
    finished_at timestamptz(3) NOT NULL, observation_id uuid NOT NULL,
    state jsonb CHECK(state IS NULL OR octet_length(state::text)<=32768), updated_at timestamptz(3) NOT NULL,
    FOREIGN KEY(host_id,agent_id) REFERENCES tinywarden.agents(host_id,id) ON DELETE RESTRICT,
    FOREIGN KEY(agent_id,generation) REFERENCES tinywarden.agent_credentials(agent_id,generation) ON DELETE RESTRICT,
    PRIMARY KEY(installation_id,agent_id)
  )`.execute(db);
  await sql`CREATE INDEX skill_state_host ON tinywarden.skill_states(host_id)`.execute(db);
  await sql`CREATE INDEX skill_state_agent ON tinywarden.skill_states(agent_id,generation)`.execute(db);
  await sql`CREATE INDEX skill_state_package ON tinywarden.skill_states(content_sha256)`.execute(db);
  await sql`CREATE INDEX skill_state_expiry ON tinywarden.skill_states(updated_at)`.execute(db);
  // Compact receipts deliberately survive detail pruning and do not depend on observation rows.
  await sql`CREATE TABLE tinywarden.skill_package_receipts (
    agent_id uuid NOT NULL, generation bigint NOT NULL, installation_id uuid NOT NULL,
    run_sequence bigint NOT NULL CHECK(run_sequence BETWEEN 1 AND 9007199254740991),
    run_id uuid NOT NULL UNIQUE, assignment_id uuid NOT NULL REFERENCES tinywarden.skill_assignments(id) ON DELETE RESTRICT,
    request_digest bytea NOT NULL CHECK(octet_length(request_digest)=32),
    received_at timestamptz(3) NOT NULL, current boolean NOT NULL,
    FOREIGN KEY(agent_id,generation) REFERENCES tinywarden.agent_credentials(agent_id,generation) ON DELETE RESTRICT,
    FOREIGN KEY(installation_id) REFERENCES tinywarden.skill_installations(id) ON DELETE RESTRICT,
    PRIMARY KEY(agent_id,generation,installation_id,run_sequence)
  )`.execute(db);
  await sql`CREATE INDEX skill_receipt_assignment ON tinywarden.skill_package_receipts(assignment_id)`.execute(db);
  await sql`CREATE INDEX skill_receipt_installation ON tinywarden.skill_package_receipts(installation_id)`.execute(db);
  await sql`CREATE TABLE tinywarden.skill_package_mutations (
    operator_id uuid NOT NULL REFERENCES tinywarden.operators(id) ON DELETE RESTRICT,
    request_id uuid NOT NULL, fingerprint bytea NOT NULL CHECK(octet_length(fingerprint)=32),
    action text NOT NULL CHECK(action ~ '^[a-z_]{1,32}$'), installation_id uuid NOT NULL,
    completed_at timestamptz(3) NOT NULL, result jsonb NOT NULL CHECK(octet_length(result::text)<=65536),
    PRIMARY KEY(operator_id,request_id),
    FOREIGN KEY(installation_id) REFERENCES tinywarden.skill_installations(id) ON DELETE RESTRICT
  )`.execute(db);
  await sql`CREATE INDEX skill_mutation_installation ON tinywarden.skill_package_mutations(installation_id)`.execute(db);
  await sql`CREATE TABLE tinywarden.skill_runtime_hosts (
    agent_id uuid PRIMARY KEY REFERENCES tinywarden.agents(id) ON DELETE RESTRICT,
    host_id uuid NOT NULL REFERENCES tinywarden.hosts(id) ON DELETE RESTRICT,
    generation bigint NOT NULL, ready boolean NOT NULL, reported_at timestamptz(3) NOT NULL,
    FOREIGN KEY(agent_id,generation) REFERENCES tinywarden.agent_credentials(agent_id,generation) ON DELETE RESTRICT
  )`.execute(db);
  await sql`CREATE INDEX skill_runtime_host ON tinywarden.skill_runtime_hosts(host_id)`.execute(db);
  for (const table of ["skill_runtime_hosts", "skill_packages", "skill_installations", "skill_settings_revisions", "host_skill_policies",
    "host_skill_policy_revisions", "skill_assignments", "skill_observations", "skill_states", "skill_package_receipts", "skill_package_mutations"]) {
    await sql`REVOKE ALL ON ${sql.raw(`tinywarden.${table}`)} FROM PUBLIC`.execute(db);
  }
}
export async function down(): Promise<void> { throw new Error("package_skills_require_forward_repair"); }
