import {sql,type Kysely} from "kysely";
export async function up(db:Kysely<unknown>){
 await sql`CREATE TABLE tinywarden.operator_profiles(
  operator_id uuid PRIMARY KEY REFERENCES tinywarden.operators(id) ON DELETE RESTRICT,
  display_name text NOT NULL DEFAULT '' CHECK(char_length(display_name)<=100),
  email text CHECK(char_length(email)<=254),email_verified_at timestamptz(3),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),
  CHECK(email IS NOT NULL OR email_verified_at IS NULL))`.execute(db);
 await sql`INSERT INTO tinywarden.operator_profiles(operator_id) SELECT id FROM tinywarden.operators`.execute(db);
}
export async function down(){throw new Error("account_profiles_require_backup_recovery");}
