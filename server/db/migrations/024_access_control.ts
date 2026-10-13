import {sql,type Kysely} from "kysely";
export async function up(db:Kysely<unknown>){
  await sql`CREATE TABLE tinywarden.operator_local_credentials (
    operator_id uuid PRIMARY KEY REFERENCES tinywarden.operators(id) ON DELETE RESTRICT,
    password_algorithm text NOT NULL CHECK(password_algorithm='scrypt-v1'),
    password_n integer NOT NULL CHECK(password_n=131072), password_r integer NOT NULL CHECK(password_r=8),
    password_p integer NOT NULL CHECK(password_p=1), password_salt bytea NOT NULL CHECK(octet_length(password_salt)=16),
    password_hash bytea NOT NULL CHECK(octet_length(password_hash)=64), password_changed_at timestamptz(3) NOT NULL,
    must_change_password boolean NOT NULL
  )`.execute(db);
  await sql`INSERT INTO tinywarden.operator_local_credentials SELECT id,password_algorithm,password_n,password_r,password_p,
    password_salt,password_hash,password_changed_at,false FROM tinywarden.operators`.execute(db);
  await sql`ALTER TABLE tinywarden.operators DROP CONSTRAINT operators_login_check,
    DROP COLUMN singleton, DROP COLUMN password_algorithm, DROP COLUMN password_n,
    DROP COLUMN password_r,DROP COLUMN password_p,DROP COLUMN password_salt,DROP COLUMN password_hash,DROP COLUMN password_changed_at,
    ADD COLUMN role text NOT NULL DEFAULT 'admin' CHECK(role IN ('admin','user')),
    ADD COLUMN disabled_at timestamptz(3), ADD COLUMN recovery_admin boolean NOT NULL DEFAULT true,
    ADD CONSTRAINT operators_login_format CHECK(login ~ '^[a-z0-9][a-z0-9._@-]{0,63}$'),
    ADD CONSTRAINT operators_recovery_active CHECK(NOT recovery_admin OR (role='admin' AND disabled_at IS NULL))`.execute(db);
  await sql`ALTER TABLE tinywarden.operators ALTER COLUMN role DROP DEFAULT, ALTER COLUMN recovery_admin DROP DEFAULT`.execute(db);
  await sql`CREATE UNIQUE INDEX operators_one_recovery ON tinywarden.operators(recovery_admin) WHERE recovery_admin`.execute(db);
  await sql`CREATE TABLE tinywarden.access_control_state(singleton boolean PRIMARY KEY CHECK(singleton),
    revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991))`.execute(db);
  await sql`INSERT INTO tinywarden.access_control_state VALUES(true,1)`.execute(db);
  await sql`CREATE TABLE tinywarden.access_groups(id uuid PRIMARY KEY,name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 64),created_at timestamptz(3) NOT NULL)`.execute(db);
  await sql`CREATE UNIQUE INDEX access_groups_name ON tinywarden.access_groups(lower(name))`.execute(db);
  await sql`CREATE TABLE tinywarden.access_group_members(group_id uuid NOT NULL REFERENCES tinywarden.access_groups(id) ON DELETE CASCADE,
    operator_id uuid NOT NULL REFERENCES tinywarden.operators(id) ON DELETE RESTRICT,PRIMARY KEY(group_id,operator_id))`.execute(db);
  await sql`CREATE INDEX access_members_operator ON tinywarden.access_group_members(operator_id,group_id)`.execute(db);
  await sql`CREATE TABLE tinywarden.access_user_hosts(operator_id uuid NOT NULL REFERENCES tinywarden.operators(id) ON DELETE RESTRICT,
    host_id uuid NOT NULL REFERENCES tinywarden.hosts(id) ON DELETE RESTRICT,PRIMARY KEY(operator_id,host_id))`.execute(db);
  await sql`CREATE INDEX access_user_hosts_host ON tinywarden.access_user_hosts(host_id,operator_id)`.execute(db);
  await sql`CREATE TABLE tinywarden.access_group_hosts(group_id uuid NOT NULL REFERENCES tinywarden.access_groups(id) ON DELETE CASCADE,
    host_id uuid NOT NULL REFERENCES tinywarden.hosts(id) ON DELETE RESTRICT,PRIMARY KEY(group_id,host_id))`.execute(db);
  await sql`CREATE INDEX access_group_hosts_host ON tinywarden.access_group_hosts(host_id,group_id)`.execute(db);
  await sql`ALTER TABLE tinywarden.login_throttle DROP CONSTRAINT login_throttle_attempts_check,
    ADD CHECK(attempts BETWEEN 0 AND 30)`.execute(db);
  await sql`CREATE TABLE tinywarden.login_throttle_buckets(bucket integer PRIMARY KEY CHECK(bucket BETWEEN 0 AND 1023),
    window_started_at timestamptz(3) NOT NULL,attempts integer NOT NULL CHECK(attempts BETWEEN 0 AND 5))`.execute(db);
  await sql`ALTER TABLE tinywarden.audit_events ADD COLUMN access_change jsonb CHECK(access_change IS NULL OR
    (jsonb_typeof(access_change)='object' AND octet_length(access_change::text)<=65536))`.execute(db);
}
export async function down(){throw new Error("access_control_requires_backup_recovery");}
