import {sql,type Kysely} from "kysely";
export async function up(db:Kysely<unknown>){
  await sql`CREATE TABLE agent_release_catalog (
    version text PRIMARY KEY CHECK (length(version)<=29), manifest text NOT NULL CHECK (octet_length(manifest)<=16384),
    signature text NOT NULL CHECK (length(signature)<=256), metadata jsonb NOT NULL CHECK (octet_length(metadata::text)<=16384), verified_at timestamptz(3) NOT NULL
  )`.execute(db);
  await sql`CREATE TABLE agent_release_catalog_state (
    singleton boolean PRIMARY KEY CHECK (singleton), checked_at timestamptz(3), verified_at timestamptz(3),
    etag text CHECK (octet_length(etag)<=256),tags jsonb NOT NULL CHECK (jsonb_typeof(tags)='array' AND jsonb_array_length(tags)<=100),
    error text CHECK (error IN ('github_unavailable','release_invalid','catalog_limit'))
  )`.execute(db);
  await sql`INSERT INTO agent_release_catalog_state VALUES (true,null,null,null,'[]',null)`.execute(db);
  await sql`CREATE TABLE agent_update_defaults (
    singleton boolean PRIMARY KEY CHECK (singleton),automatic boolean NOT NULL,revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    updated_at timestamptz(3) NOT NULL,last_request_id uuid,last_fingerprint bytea CHECK (octet_length(last_fingerprint)=32)
  )`.execute(db);
  await sql`INSERT INTO agent_update_defaults VALUES (true,true,1,CURRENT_TIMESTAMP,null,null)`.execute(db);
  await sql`CREATE TABLE host_agent_update_policies (
    host_id uuid PRIMARY KEY REFERENCES hosts(id),automatic boolean,revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    updated_at timestamptz(3) NOT NULL,last_request_id uuid NOT NULL,last_fingerprint bytea NOT NULL CHECK (octet_length(last_fingerprint)=32)
  )`.execute(db);
  await sql`CREATE TABLE agent_platform_reports (
    agent_id uuid PRIMARY KEY REFERENCES agents(id),generation bigint NOT NULL CHECK (generation BETWEEN 1 AND 9007199254740991),
    sequence bigint NOT NULL CHECK (sequence BETWEEN 1 AND 9007199254740991),observed_at timestamptz(3) NOT NULL,received_at timestamptz(3) NOT NULL,
    observation jsonb NOT NULL CHECK (jsonb_typeof(observation)='object' AND octet_length(observation::text)<=8192)
  )`.execute(db);
}
export async function down():Promise<void>{throw new Error("agent_updates_require_forward_repair");}
