import {sql,type Kysely} from "kysely";
export async function up(db:Kysely<unknown>){
  await sql`CREATE INDEX skill_observation_collection_history ON skill_observations
    (host_id,installation_id,(CASE WHEN outcome='observed' THEN LEAST(finished_at,received_at) ELSE received_at END) DESC,id DESC)`.execute(db);
}
export async function down():Promise<void>{throw new Error("skill_collection_history_requires_forward_repair");}
