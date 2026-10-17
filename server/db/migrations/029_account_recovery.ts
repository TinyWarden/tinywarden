import {sql,type Kysely} from "kysely";
export async function up(db:Kysely<unknown>){
 await sql`ALTER TABLE tinywarden.operator_profiles ADD COLUMN email_revision bigint NOT NULL DEFAULT 1 CHECK(email_revision BETWEEN 1 AND 9007199254740991)`.execute(db);
 await sql`CREATE TABLE tinywarden.account_email_tokens(
  id uuid PRIMARY KEY,operator_id uuid NOT NULL REFERENCES tinywarden.operators(id) ON DELETE RESTRICT,
  purpose text NOT NULL CHECK(purpose IN('verify','reset')),secret_digest bytea NOT NULL CHECK(octet_length(secret_digest)=32),
  auth_version bigint NOT NULL,email_revision bigint NOT NULL,email text NOT NULL CHECK(char_length(email)<=254),
  issued_at timestamptz(3) NOT NULL,expires_at timestamptz(3) NOT NULL CHECK(expires_at>issued_at))`.execute(db);
 await sql`CREATE UNIQUE INDEX account_email_token_owner ON tinywarden.account_email_tokens(operator_id,purpose)`.execute(db);
 await sql`CREATE INDEX account_email_token_expiry ON tinywarden.account_email_tokens(expires_at)`.execute(db);
 await sql`CREATE TABLE tinywarden.account_email_jobs(
  id uuid PRIMARY KEY,purpose text NOT NULL CHECK(purpose IN('verify','reset','reset_notice')),
  login text NOT NULL CHECK(char_length(login) BETWEEN 1 AND 64),operator_id uuid REFERENCES tinywarden.operators(id) ON DELETE RESTRICT,
  auth_version bigint,email_revision bigint,email text CHECK(char_length(email)<=254),
  state text NOT NULL CHECK(state IN('queued','claimed','done')),outcome text CHECK(outcome IN('sent','skipped','failed','uncertain','abandoned')),
  created_at timestamptz(3) NOT NULL,claimed_at timestamptz(3),finished_at timestamptz(3),
  CHECK(purpose='reset' OR (operator_id IS NOT NULL AND auth_version IS NOT NULL AND email_revision IS NOT NULL AND email IS NOT NULL)))`.execute(db);
 await sql`CREATE INDEX account_email_pending ON tinywarden.account_email_jobs(created_at,id) WHERE state='queued'`.execute(db);
 await sql`CREATE INDEX account_email_jobs_cleanup ON tinywarden.account_email_jobs(created_at)`.execute(db);
 await sql`CREATE TABLE tinywarden.account_email_throttle(
  key bytea PRIMARY KEY CHECK(octet_length(key)=32),started_at timestamptz(3) NOT NULL,count integer NOT NULL CHECK(count BETWEEN 0 AND 90))`.execute(db);
}
export async function down(){throw new Error("account_recovery_requires_backup_recovery");}
