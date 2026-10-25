import {sql,type Kysely} from 'kysely';
export async function up(db:Kysely<unknown>){
 await sql`CREATE TABLE tinywarden.skill_action_grants(
  id uuid PRIMARY KEY,installation_id uuid NOT NULL REFERENCES tinywarden.skill_installations(id) ON DELETE CASCADE,
  content_sha256 text NOT NULL REFERENCES tinywarden.skill_packages(content_sha256),action_id text NOT NULL,
  descriptor_sha256 text NOT NULL CHECK(descriptor_sha256 ~ '^[a-f0-9]{64}$'),
  action_version integer NOT NULL CHECK(action_version BETWEEN 1 AND 65535),origin jsonb NOT NULL,
  revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),enabled boolean NOT NULL,
  operator_id uuid NOT NULL REFERENCES tinywarden.operators(id),created_at timestamptz(3) NOT NULL,updated_at timestamptz(3) NOT NULL,
  UNIQUE(installation_id,content_sha256,action_id),CHECK(action_id ~ '^[a-z][a-z0-9_.]{1,63}$'))`.execute(db);
 await sql`CREATE TABLE tinywarden.agent_action_workers(
  agent_id uuid PRIMARY KEY REFERENCES tinywarden.agents(id) ON DELETE CASCADE,generation bigint NOT NULL,
  worker_ready boolean NOT NULL,origins jsonb NOT NULL,reported_at timestamptz(3) NOT NULL,cutover_at timestamptz(3) NOT NULL,
  CHECK(jsonb_typeof(origins)='array' AND octet_length(origins::text)<=16384))`.execute(db);
 await sql`CREATE TABLE tinywarden.agent_action_readiness(
  agent_id uuid NOT NULL REFERENCES tinywarden.agents(id) ON DELETE CASCADE,generation bigint NOT NULL,
  grant_id uuid NOT NULL REFERENCES tinywarden.skill_action_grants(id) ON DELETE CASCADE,
  report jsonb NOT NULL,reported_at timestamptz(3) NOT NULL,PRIMARY KEY(agent_id,grant_id),
  CHECK(octet_length(report::text)<=8192))`.execute(db);
 await sql`CREATE TABLE tinywarden.skill_action_mutations(
  operator_id uuid NOT NULL REFERENCES tinywarden.operators(id),request_id uuid NOT NULL,
  fingerprint bytea NOT NULL,result jsonb NOT NULL,completed_at timestamptz(3) NOT NULL,PRIMARY KEY(operator_id,request_id))`.execute(db);
 await sql`ALTER TABLE tinywarden.maintenance_jobs
  ADD COLUMN action_binding jsonb,ADD COLUMN action_snapshot jsonb,
  ADD COLUMN input_json text,ADD COLUMN settings_json text,ADD COLUMN action_archive jsonb,
  ADD COLUMN action_enablement_version bigint,ADD COLUMN action_monitoring_epoch bigint,
  ADD COLUMN content_sha256 text REFERENCES tinywarden.skill_packages(content_sha256),
  ADD CONSTRAINT action_binding_complete CHECK((action_binding IS NULL AND input_json IS NULL AND settings_json IS NULL AND action_archive IS NULL AND content_sha256 IS NULL AND action_enablement_version IS NULL AND action_monitoring_epoch IS NULL)
   OR (action_binding IS NOT NULL AND action_snapshot IS NOT NULL AND input_json IS NOT NULL AND settings_json IS NOT NULL AND action_archive IS NOT NULL AND content_sha256 IS NOT NULL AND action_enablement_version IS NOT NULL AND action_monitoring_epoch IS NOT NULL AND action_enablement_version>0 AND action_monitoring_epoch>0)),
  ADD CHECK(action_snapshot IS NULL OR octet_length(action_snapshot::text)<=1048576),
  ADD CHECK(input_json IS NULL OR octet_length(input_json)<=65536),
  ADD CHECK(settings_json IS NULL OR octet_length(settings_json)<=65536)`.execute(db);
 await sql`CREATE INDEX maintenance_action_package ON tinywarden.maintenance_jobs(content_sha256) WHERE content_sha256 IS NOT NULL`.execute(db);
 await sql`ALTER TABLE tinywarden.maintenance_jobs DROP CONSTRAINT maintenance_jobs_effect_check,
  ADD CHECK(effect IN ('none','changed','indexes_changed','packages_changed','unknown'))`.execute(db);
 await sql`ALTER TABLE tinywarden.maintenance_plans ADD COLUMN provider_json text,
  ADD CHECK(provider_json IS NULL OR octet_length(provider_json)<=4194304)`.execute(db);
 await sql`ALTER TABLE tinywarden.skill_runtime_hosts ADD COLUMN sdk3_support boolean NOT NULL DEFAULT false`.execute(db);
}
export async function down(){throw new Error('irreversible_action_authority_migration');}
