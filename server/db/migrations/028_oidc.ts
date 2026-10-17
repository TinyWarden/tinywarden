import {sql,type Kysely} from "kysely";
export async function up(db:Kysely<unknown>){
 await sql`CREATE TABLE tinywarden.oidc_providers(
  id uuid PRIMARY KEY,singleton boolean NOT NULL UNIQUE DEFAULT true CHECK(singleton),
  label text NOT NULL CHECK(char_length(label) BETWEEN 1 AND 64),
  issuer text NOT NULL CHECK(char_length(issuer)<=2048),client_id text NOT NULL CHECK(char_length(client_id) BETWEEN 1 AND 256),
  enabled boolean NOT NULL,auto_create boolean NOT NULL,groups_claim text NOT NULL CHECK(char_length(groups_claim) BETWEEN 1 AND 64),
  revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991))`.execute(db);
 await sql`CREATE TABLE tinywarden.operator_external_identities(
  id uuid PRIMARY KEY,operator_id uuid NOT NULL REFERENCES tinywarden.operators(id) ON DELETE RESTRICT,
  provider_id uuid NOT NULL REFERENCES tinywarden.oidc_providers(id) ON DELETE RESTRICT,
  protocol text NOT NULL CHECK(protocol='oidc'),issuer text NOT NULL,subject text NOT NULL CHECK(char_length(subject) BETWEEN 1 AND 255),
  created_at timestamptz(3) NOT NULL,UNIQUE(protocol,issuer,subject),UNIQUE(operator_id,provider_id))`.execute(db);
 await sql`CREATE TABLE tinywarden.oidc_group_mappings(
  provider_id uuid NOT NULL REFERENCES tinywarden.oidc_providers(id) ON DELETE CASCADE,
  external_group text NOT NULL CHECK(char_length(external_group) BETWEEN 1 AND 256),
  group_id uuid NOT NULL REFERENCES tinywarden.access_groups(id) ON DELETE CASCADE,
  PRIMARY KEY(provider_id,external_group,group_id))`.execute(db);
 await sql`CREATE TABLE tinywarden.access_external_memberships(
  provider_id uuid NOT NULL REFERENCES tinywarden.oidc_providers(id) ON DELETE CASCADE,
  operator_id uuid NOT NULL REFERENCES tinywarden.operators(id) ON DELETE RESTRICT,
  group_id uuid NOT NULL REFERENCES tinywarden.access_groups(id) ON DELETE CASCADE,
  valid_until timestamptz(3) NOT NULL,PRIMARY KEY(provider_id,operator_id,group_id))`.execute(db);
 await sql`CREATE INDEX external_members_expiry ON tinywarden.access_external_memberships(valid_until)`.execute(db);
 await sql`CREATE VIEW tinywarden.access_effective_group_members AS
  SELECT group_id,operator_id FROM tinywarden.access_group_members UNION
  SELECT m.group_id,m.operator_id FROM tinywarden.access_external_memberships m
  JOIN tinywarden.oidc_providers p ON p.id=m.provider_id
  WHERE p.enabled AND m.valid_until>CURRENT_TIMESTAMP`.execute(db);
 await sql`ALTER TABLE tinywarden.operator_sessions ADD COLUMN auth_method text NOT NULL DEFAULT 'local' CHECK(auth_method IN('local','oidc')),
  ADD COLUMN external_identity_id uuid REFERENCES tinywarden.operator_external_identities(id) ON DELETE CASCADE,
  ADD CHECK((auth_method='local' AND external_identity_id IS NULL) OR (auth_method='oidc' AND external_identity_id IS NOT NULL))`.execute(db);
 await sql`CREATE TABLE tinywarden.oidc_transactions(
  id uuid PRIMARY KEY,provider_id uuid NOT NULL REFERENCES tinywarden.oidc_providers(id) ON DELETE CASCADE,
  provider_revision bigint NOT NULL,state_digest bytea NOT NULL UNIQUE CHECK(octet_length(state_digest)=32),
  browser_digest bytea NOT NULL CHECK(octet_length(browser_digest)=32),nonce text NOT NULL,pkce_verifier text NOT NULL,
  intent text NOT NULL CHECK(intent IN('login','link')),operator_id uuid REFERENCES tinywarden.operators(id) ON DELETE CASCADE,
  session_id uuid REFERENCES tinywarden.operator_sessions(id) ON DELETE CASCADE,auth_version bigint,
  issued_at timestamptz(3) NOT NULL,expires_at timestamptz(3) NOT NULL,
  CHECK(expires_at>issued_at),CHECK((intent='login' AND operator_id IS NULL AND session_id IS NULL AND auth_version IS NULL)
   OR (intent='link' AND operator_id IS NOT NULL AND session_id IS NOT NULL AND auth_version IS NOT NULL)))`.execute(db);
 await sql`CREATE INDEX oidc_transactions_expiry ON tinywarden.oidc_transactions(expires_at)`.execute(db);
}
export async function down(){throw new Error("oidc_requires_backup_recovery");}
