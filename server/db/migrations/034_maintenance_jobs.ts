import {sql,type Kysely} from 'kysely';

export async function up(db:Kysely<unknown>){
 await sql`CREATE TABLE tinywarden.maintenance_jobs (
  id uuid PRIMARY KEY, operation_id uuid NOT NULL, host_id uuid NOT NULL,
  agent_id uuid NOT NULL, generation bigint NOT NULL CHECK(generation BETWEEN 1 AND 9007199254740991),
  action text NOT NULL CHECK(action ~ '^[a-z][a-z0-9_.]{1,63}$'), provider_version integer NOT NULL CHECK(provider_version>0),
  phase text NOT NULL CHECK(phase IN ('queued','preparing','awaiting_approval','approved','downloading','applying','verifying','succeeded','no_changes','blocked','failed','expired','cancelled')),
  attention boolean NOT NULL DEFAULT false, cancel_requested boolean NOT NULL DEFAULT false,
  recovery_id uuid, recovery_pending boolean NOT NULL DEFAULT false,
  effect text NOT NULL DEFAULT 'none' CHECK(effect IN ('none','indexes_changed','packages_changed','unknown')),
  reason text CHECK(reason ~ '^maintenance_[a-z_]{1,64}$'), process_running boolean NOT NULL DEFAULT false,
  apply_attempt uuid, grant_expires_at timestamptz(3), apply_started_at timestamptz(3),
  plan_id uuid, approval_id uuid, ordinal integer NOT NULL CHECK(ordinal BETWEEN 0 AND 99),
  last_sequence bigint NOT NULL DEFAULT 0 CHECK(last_sequence BETWEEN 0 AND 256),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),
  delivered_at timestamptz(3), reconciled_at timestamptz(3), checked_at timestamptz(3), upload_sha256 text CHECK(upload_sha256 ~ '^[a-f0-9]{64}$'), upload_parts integer CHECK(upload_parts BETWEEN 1 AND 128),
  baseline jsonb, prepared_at timestamptz(3), plan_expires_at timestamptz(3), verification_requested_at timestamptz(3),
  result jsonb, created_at timestamptz(3) NOT NULL, expires_at timestamptz(3) NOT NULL,
  updated_at timestamptz(3) NOT NULL, completed_at timestamptz(3),
  UNIQUE(operation_id,host_id), UNIQUE(operation_id,ordinal),
  FOREIGN KEY(operation_id,host_id) REFERENCES tinywarden.fleet_operation_items(operation_id,host_id) ON DELETE CASCADE,
  CHECK(expires_at>created_at), CHECK((apply_attempt IS NULL)=(apply_started_at IS NULL)),
  CHECK(phase NOT IN ('applying','verifying') OR apply_attempt IS NOT NULL),
  CHECK((phase IN ('succeeded','no_changes','blocked','failed','expired','cancelled'))=(completed_at IS NOT NULL)),
  CHECK(baseline IS NULL OR octet_length(baseline::text)<=4194304),
  CHECK(completed_at IS NULL OR NOT process_running OR attention),
  CHECK(NOT recovery_pending OR (attention AND recovery_id IS NOT NULL)),
  CHECK(phase NOT IN ('succeeded','no_changes') OR (result IS NOT NULL AND result @> '{"local_verified":true,"process_running":false}'::jsonb)),
  CHECK(result IS NULL OR (jsonb_typeof(result)='object' AND octet_length(result::text)<=65536)))`.execute(db);
 await sql`CREATE UNIQUE INDEX maintenance_one_active ON tinywarden.maintenance_jobs(host_id)
  WHERE attention OR phase NOT IN ('succeeded','no_changes','blocked','failed','expired','cancelled')`.execute(db);
 await sql`CREATE INDEX maintenance_host_history ON tinywarden.maintenance_jobs(host_id,created_at,id)`.execute(db);
 await sql`CREATE INDEX maintenance_retention ON tinywarden.maintenance_jobs(completed_at,id) WHERE completed_at IS NOT NULL AND NOT attention AND NOT process_running`.execute(db);
 await sql`CREATE INDEX maintenance_delivery ON tinywarden.maintenance_jobs(agent_id,generation,created_at)
  WHERE attention OR completed_at IS NULL`.execute(db);
 await sql`CREATE INDEX maintenance_sweep ON tinywarden.maintenance_jobs(checked_at NULLS FIRST,id) WHERE completed_at IS NULL`.execute(db);
 await sql`CREATE TABLE tinywarden.maintenance_plans (
  id uuid PRIMARY KEY, job_id uuid NOT NULL UNIQUE REFERENCES tinywarden.maintenance_jobs(id) ON DELETE CASCADE,
  provider_plan jsonb NOT NULL, verification jsonb NOT NULL, provider_sha256 text NOT NULL CHECK(provider_sha256 ~ '^[a-f0-9]{64}$'),
  verification_sha256 text NOT NULL CHECK(verification_sha256 ~ '^[a-f0-9]{64}$'), digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz(3) NOT NULL, expires_at timestamptz(3) NOT NULL CHECK(expires_at>created_at),
  CHECK(octet_length(provider_plan::text)<=4194304), CHECK(octet_length(verification::text)<=4194304))`.execute(db);
 await sql`CREATE TABLE tinywarden.maintenance_approvals (
  id uuid PRIMARY KEY, operation_id uuid NOT NULL REFERENCES tinywarden.fleet_operations(id) ON DELETE CASCADE,
  operator_id uuid NOT NULL REFERENCES tinywarden.operators(id), fingerprint bytea NOT NULL CHECK(octet_length(fingerprint)=32),
  targets jsonb NOT NULL CHECK(jsonb_typeof(targets)='array' AND jsonb_array_length(targets) BETWEEN 1 AND 100),
  policy_revision text NOT NULL, created_at timestamptz(3) NOT NULL)`.execute(db);
 await sql`ALTER TABLE tinywarden.maintenance_jobs
  ADD FOREIGN KEY(plan_id) REFERENCES tinywarden.maintenance_plans(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  ADD FOREIGN KEY(approval_id) REFERENCES tinywarden.maintenance_approvals(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED`.execute(db);
 await sql`CREATE INDEX maintenance_job_plan ON tinywarden.maintenance_jobs(plan_id) WHERE plan_id IS NOT NULL`.execute(db);
 await sql`CREATE INDEX maintenance_job_approval ON tinywarden.maintenance_jobs(approval_id) WHERE approval_id IS NOT NULL`.execute(db);
 await sql`CREATE INDEX maintenance_approval_operation ON tinywarden.maintenance_approvals(operation_id,created_at,id)`.execute(db);
 await sql`CREATE INDEX maintenance_approval_operator ON tinywarden.maintenance_approvals(operator_id,created_at,id)`.execute(db);
 await sql`CREATE TABLE tinywarden.maintenance_events (
  job_id uuid NOT NULL REFERENCES tinywarden.maintenance_jobs(id) ON DELETE CASCADE,
  sequence bigint NOT NULL CHECK(sequence BETWEEN 1 AND 256),
  fingerprint bytea NOT NULL CHECK(octet_length(fingerprint)=32), phase text NOT NULL,
  facts jsonb NOT NULL CHECK(octet_length(facts::text)<=65536), reply jsonb NOT NULL CHECK(octet_length(reply::text)<=65536), received_at timestamptz(3) NOT NULL,
  PRIMARY KEY(job_id,sequence))`.execute(db);
 await sql`CREATE FUNCTION tinywarden.maintenance_immutable_record() RETURNS trigger LANGUAGE plpgsql AS
  $$ BEGIN RAISE EXCEPTION 'Immutable maintenance record'; END $$`.execute(db);
 await sql`CREATE TABLE tinywarden.maintenance_plan_parts (
  job_id uuid NOT NULL REFERENCES tinywarden.maintenance_jobs(id) ON DELETE CASCADE,
  part integer NOT NULL CHECK(part BETWEEN 0 AND 127), total integer NOT NULL CHECK(total BETWEEN 1 AND 128 AND part<total),
  provider_sha256 text NOT NULL CHECK(provider_sha256 ~ '^[a-f0-9]{64}$'),
  content text NOT NULL CHECK(octet_length(content)<=43692), received_at timestamptz(3) NOT NULL,
  PRIMARY KEY(job_id,part))`.execute(db);
 await sql`CREATE TABLE tinywarden.maintenance_verification_runs (
  job_id uuid NOT NULL REFERENCES tinywarden.maintenance_jobs(id) ON DELETE CASCADE,
  installation_id uuid NOT NULL, stage text NOT NULL CHECK(stage IN ('baseline','post')), manual_run_id uuid REFERENCES tinywarden.skill_manual_runs(id) ON DELETE SET NULL,
  PRIMARY KEY(job_id,installation_id,stage))`.execute(db);
 await sql`CREATE INDEX maintenance_manual_link ON tinywarden.maintenance_verification_runs(manual_run_id) WHERE manual_run_id IS NOT NULL`.execute(db);
 for(const table of ['maintenance_plans','maintenance_approvals','maintenance_events','maintenance_plan_parts']){
  await sql`CREATE TRIGGER maintenance_immutable BEFORE UPDATE ON ${sql.table('tinywarden.'+table)}
   FOR EACH ROW EXECUTE FUNCTION tinywarden.maintenance_immutable_record()`.execute(db);
 }
 await sql`CREATE TABLE tinywarden.maintenance_recoveries (
  id uuid PRIMARY KEY, job_id uuid NOT NULL REFERENCES tinywarden.maintenance_jobs(id) ON DELETE CASCADE,
  operator_id uuid NOT NULL REFERENCES tinywarden.operators(id), fingerprint bytea NOT NULL CHECK(octet_length(fingerprint)=32),
  token_digest bytea NOT NULL CHECK(octet_length(token_digest)=32), scope jsonb NOT NULL CHECK(octet_length(scope::text)<=16384),
  created_at timestamptz(3) NOT NULL, expires_at timestamptz(3) NOT NULL CHECK(expires_at>created_at), revoked_at timestamptz(3),
  accepted_at timestamptz(3), acceptance_sha256 text CHECK(acceptance_sha256 ~ '^[a-f0-9]{64}$'), acceptance jsonb,
  finalized_at timestamptz(3), finalization_sha256 text CHECK(finalization_sha256 ~ '^[a-f0-9]{64}$'), finalization jsonb,
  CHECK((accepted_at IS NULL)=(acceptance_sha256 IS NULL) AND (accepted_at IS NULL)=(acceptance IS NULL)),
  CHECK((finalized_at IS NULL)=(finalization_sha256 IS NULL) AND (finalized_at IS NULL)=(finalization IS NULL)),
  CHECK(finalized_at IS NULL OR accepted_at IS NOT NULL), CHECK(revoked_at IS NULL OR accepted_at IS NULL),
  CHECK(acceptance IS NULL OR octet_length(acceptance::text)<=65536),
  CHECK(finalization IS NULL OR octet_length(finalization::text)<=65536))`.execute(db);
 await sql`CREATE UNIQUE INDEX maintenance_recovery_unconsumed ON tinywarden.maintenance_recoveries(job_id)
  WHERE revoked_at IS NULL AND accepted_at IS NULL`.execute(db);
 await sql`CREATE UNIQUE INDEX maintenance_recovery_pending ON tinywarden.maintenance_recoveries(job_id)
  WHERE accepted_at IS NOT NULL AND finalized_at IS NULL`.execute(db);
 await sql`CREATE INDEX maintenance_recovery_job ON tinywarden.maintenance_recoveries(job_id,id)`.execute(db);
 await sql`CREATE INDEX maintenance_recovery_operator ON tinywarden.maintenance_recoveries(operator_id,created_at,id)`.execute(db);
 await sql`ALTER TABLE tinywarden.maintenance_jobs ADD FOREIGN KEY(recovery_id)
  REFERENCES tinywarden.maintenance_recoveries(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED`.execute(db);
 await sql`CREATE INDEX maintenance_job_recovery ON tinywarden.maintenance_jobs(recovery_id) WHERE recovery_id IS NOT NULL`.execute(db);
 await sql`CREATE FUNCTION tinywarden.maintenance_recovery_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF (NEW.id,NEW.job_id,NEW.operator_id,NEW.fingerprint,NEW.token_digest,NEW.scope,NEW.created_at,NEW.expires_at)
    IS DISTINCT FROM (OLD.id,OLD.job_id,OLD.operator_id,OLD.fingerprint,OLD.token_digest,OLD.scope,OLD.created_at,OLD.expires_at)
   OR (OLD.accepted_at IS NOT NULL AND (NEW.accepted_at,NEW.acceptance_sha256,NEW.acceptance)
    IS DISTINCT FROM (OLD.accepted_at,OLD.acceptance_sha256,OLD.acceptance))
   OR (OLD.finalized_at IS NOT NULL AND (NEW.finalized_at,NEW.finalization_sha256,NEW.finalization)
    IS DISTINCT FROM (OLD.finalized_at,OLD.finalization_sha256,OLD.finalization))
   OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
  THEN RAISE EXCEPTION 'Immutable maintenance recovery'; END IF; RETURN NEW; END $$`.execute(db);
 await sql`CREATE TRIGGER maintenance_recovery_immutable BEFORE UPDATE ON tinywarden.maintenance_recoveries
  FOR EACH ROW EXECUTE FUNCTION tinywarden.maintenance_recovery_guard()`.execute(db);
}
export async function down(){throw new Error('Forward repair required for durable maintenance jobs');}
