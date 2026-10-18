import {sql,type Kysely} from "kysely";
export async function up(db:Kysely<unknown>){
 await sql`ALTER TABLE tinywarden.skill_runtime_hosts ADD COLUMN resource_support boolean NOT NULL DEFAULT false`.execute(db);
 await sql`CREATE TABLE tinywarden.skill_resource_memberships(
  id uuid PRIMARY KEY,host_id uuid NOT NULL REFERENCES tinywarden.hosts(id) ON DELETE RESTRICT,
  installation_id uuid NOT NULL REFERENCES tinywarden.skill_installations(id) ON DELETE RESTRICT,
  collection text NOT NULL CHECK(collection ~ '^[a-z][a-z0-9_]{0,63}$'),
  resource_key text NOT NULL CHECK(octet_length(resource_key) BETWEEN 1 AND 255),
  label text NOT NULL CHECK(octet_length(label)<=256),created_at timestamptz(3) NOT NULL,retired_at timestamptz(3))`.execute(db);
 await sql`CREATE UNIQUE INDEX skill_resource_active ON tinywarden.skill_resource_memberships(host_id,installation_id,collection,resource_key) WHERE retired_at IS NULL`.execute(db);
 await sql`CREATE INDEX skill_resource_retired ON tinywarden.skill_resource_memberships(retired_at) WHERE retired_at IS NOT NULL`.execute(db);
 await sql`CREATE TABLE tinywarden.skill_resource_inventories(
  host_id uuid NOT NULL REFERENCES tinywarden.hosts(id) ON DELETE RESTRICT,
  installation_id uuid NOT NULL REFERENCES tinywarden.skill_installations(id) ON DELETE RESTRICT,
  collection text NOT NULL,snapshot_id uuid NOT NULL,observation_id uuid NOT NULL,
  agent_id uuid NOT NULL REFERENCES tinywarden.agents(id) ON DELETE RESTRICT,generation bigint NOT NULL,
  content_sha256 text NOT NULL REFERENCES tinywarden.skill_packages(content_sha256) ON DELETE RESTRICT,
  run_sequence bigint NOT NULL,captured_at timestamptz(3) NOT NULL,received_at timestamptz(3) NOT NULL,
  complete boolean NOT NULL,reason jsonb,items jsonb NOT NULL CHECK(jsonb_typeof(items)='array' AND octet_length(items::text)<=524288),
  PRIMARY KEY(host_id,installation_id,collection))`.execute(db);
 await sql`CREATE TABLE tinywarden.skill_resource_scans(
  consumer text NOT NULL CHECK(consumer IN ('history','notifications')),scope uuid NOT NULL,
  host_id uuid NOT NULL REFERENCES tinywarden.hosts(id) ON DELETE RESTRICT,
  after_member uuid,updated_at timestamptz(3) NOT NULL,PRIMARY KEY(consumer,scope,host_id))`.execute(db);
 for(const table of ['history_subjects','history_events','notification_cursors']){
  await sql`ALTER TABLE ${sql.id('tinywarden',table)}
   ADD COLUMN resource_collection text,ADD COLUMN resource_key text,
   ADD COLUMN resource_epoch uuid REFERENCES tinywarden.skill_resource_memberships(id) ON DELETE RESTRICT,
   ADD COLUMN evaluation_revision text,
   ADD CONSTRAINT ${sql.id(table+'_resource_shape')} CHECK(
    (resource_collection IS NULL AND resource_key IS NULL AND resource_epoch IS NULL AND evaluation_revision IS NULL) OR
    (resource_collection IS NOT NULL AND resource_collection ~ '^[a-z][a-z0-9_]{0,63}$' AND resource_key IS NOT NULL AND octet_length(resource_key) BETWEEN 1 AND 255 AND resource_epoch IS NOT NULL AND evaluation_revision IS NOT NULL AND evaluation_revision ~ '^[0-9a-f]{64}$'))`.execute(db);
 }
 await sql`ALTER TABLE tinywarden.history_subjects DROP CONSTRAINT history_subjects_host_id_subject_key_key`.execute(db);
 await sql`CREATE UNIQUE INDEX history_resource_subject ON tinywarden.history_subjects(host_id,subject_key,resource_collection,resource_key) NULLS NOT DISTINCT`.execute(db);
 await sql`DROP INDEX tinywarden.notification_current_subject`.execute(db);
 await sql`CREATE UNIQUE INDEX notification_current_subject ON tinywarden.notification_cursors(route_id,host_id,subject_key,resource_collection,resource_key) NULLS NOT DISTINCT WHERE current`.execute(db);
 for(const table of ['history_subjects','history_events','notification_cursors'])await sql`CREATE INDEX ${sql.id(table+'_resource_epoch')} ON ${sql.id('tinywarden',table)}(resource_epoch) WHERE resource_epoch IS NOT NULL`.execute(db);
 for(const table of ['history_subjects','history_events']){
  const checks=await sql<{name:string;definition:string}>`SELECT conname AS name,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=${'tinywarden.'+table}::regclass AND contype='c'`.execute(db);
  for(const check of checks.rows.filter(c=>c.definition.includes("'disabled'::text"))){
   await sql`ALTER TABLE ${sql.id('tinywarden',table)} DROP CONSTRAINT ${sql.id(check.name)}`.execute(db);
   await sql`ALTER TABLE ${sql.id('tinywarden',table)} ADD CONSTRAINT ${sql.id(check.name)} ${sql.raw(check.definition.replaceAll("'disabled'::text","'disabled'::text, 'not_configured'::text"))}`.execute(db);
  }
 }
 for(const [table,column,limit] of [['skill_states','state',131072],['skill_observations','assessments',1048576]] as const){
  const checks=await sql<{name:string;definition:string}>`SELECT conname AS name,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=${'tinywarden.'+table}::regclass AND contype='c'`.execute(db);
  const check=checks.rows.find(c=>c.definition.includes(`octet_length((${column})::text)`));
  if(!check)throw new Error('resource_storage_constraint_missing');
  await sql`ALTER TABLE ${sql.id('tinywarden',table)} DROP CONSTRAINT ${sql.id(check.name)}`.execute(db);
  await sql`ALTER TABLE ${sql.id('tinywarden',table)} ADD CONSTRAINT ${sql.id(check.name)} ${sql.raw(check.definition.replace(/<= \d+/,`<= ${limit}`))}`.execute(db);
 }
 for(const name of ['skill_resource_memberships','skill_resource_inventories','skill_resource_scans'])await sql`REVOKE ALL ON ${sql.id('tinywarden',name)} FROM PUBLIC`.execute(db);
}
export async function down(){throw new Error('skill_resources_require_forward_repair');}
