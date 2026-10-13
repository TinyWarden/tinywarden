import {sql,type Kysely} from "kysely";
export async function up(db:Kysely<unknown>){
  await sql`ALTER TABLE tinywarden.operators DROP CONSTRAINT operators_recovery_active`.execute(db);
}
export async function down(){throw new Error("admin_account_policy_requires_backup_recovery");}
