import {sql,type Kysely} from "kysely";
export async function up(db:Kysely<unknown>){
  await sql`CREATE TABLE tinywarden.skill_repositories (
    id uuid PRIMARY KEY,github_id bigint NOT NULL UNIQUE CHECK(github_id>0),owner_id bigint NOT NULL CHECK(owner_id>0),
    name text NOT NULL CHECK(length(name)<=150),enabled boolean NOT NULL,removed boolean NOT NULL DEFAULT false,
    revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),catalogue_revision bigint NOT NULL DEFAULT 1 CHECK(catalogue_revision>0),
    catalogue jsonb,commit_sha text,catalogue_sha256 text,checked_at timestamptz,verified_at timestamptz,error text,retry_at timestamptz,
    CHECK(NOT removed OR NOT enabled),CHECK(catalogue IS NULL OR octet_length(catalogue::text)<=1048576))`.execute(db);
  await sql`INSERT INTO tinywarden.skill_repositories(id,github_id,owner_id,name,enabled) VALUES
    ('d8f5e2ca-2e82-4b27-a6f2-6da42664ca62',1415093600,334682923,'TinyWarden/tinywarden-skills',true)`.execute(db);
  await sql`CREATE TABLE tinywarden.skill_package_origins (
    id uuid PRIMARY KEY,content_sha256 text NOT NULL REFERENCES tinywarden.skill_packages(content_sha256),origin jsonb NOT NULL,
    CHECK(octet_length(origin::text)<=4096))`.execute(db);
  await sql`CREATE INDEX skill_origins_digest ON tinywarden.skill_package_origins(content_sha256)`.execute(db);
  await sql`CREATE TABLE tinywarden.skill_installation_sources (
    installation_id uuid PRIMARY KEY REFERENCES tinywarden.skill_installations(id),kind text NOT NULL CHECK(kind IN ('repository','upload','local')),
    repository_id uuid REFERENCES tinywarden.skill_repositories(id),origin_id uuid REFERENCES tinywarden.skill_package_origins(id),
    revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),CHECK((kind='repository')=(repository_id IS NOT NULL)),
    CHECK((kind='repository')=(origin_id IS NOT NULL)))`.execute(db);
  await sql`CREATE INDEX skill_sources_repository ON tinywarden.skill_installation_sources(repository_id)`.execute(db);
  await sql`INSERT INTO tinywarden.skill_installation_sources(installation_id,kind) SELECT id,'local' FROM tinywarden.skill_installations`.execute(db);
  await sql`CREATE TABLE tinywarden.skill_repository_preparations (
    id uuid PRIMARY KEY,operator_id uuid NOT NULL REFERENCES tinywarden.operators(id),auth_version bigint NOT NULL,
    request_id uuid NOT NULL,repository_id uuid NOT NULL REFERENCES tinywarden.skill_repositories(id),
    repository_revision bigint NOT NULL,catalogue_revision bigint NOT NULL,entry jsonb NOT NULL,
    installation_id uuid REFERENCES tinywarden.skill_installations(id),expected_digest text,expected_enablement bigint,
    expected_settings bigint,expected_source bigint,metadata jsonb,origin jsonb,compatible boolean,
    state text NOT NULL CHECK(state IN ('preparing','ready','committed','cancelled','failed')),
    created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,UNIQUE(operator_id,request_id),
    CHECK(expires_at>created_at),CHECK(state NOT IN ('ready','committed') OR metadata IS NOT NULL AND origin IS NOT NULL))`.execute(db);
  await sql`CREATE INDEX skill_preparations_expiry ON tinywarden.skill_repository_preparations(expires_at)`.execute(db);
  await sql`CREATE INDEX skill_preparations_repository ON tinywarden.skill_repository_preparations(repository_id,state)`.execute(db);
  await sql`CREATE TABLE tinywarden.skill_repository_mutations (
    operator_id uuid NOT NULL REFERENCES tinywarden.operators(id),request_id uuid NOT NULL,fingerprint bytea NOT NULL,
    action text NOT NULL,result jsonb NOT NULL,completed_at timestamptz NOT NULL,PRIMARY KEY(operator_id,request_id))`.execute(db);
}
export async function down(){throw Error("skill_repositories_require_backup_recovery");}
