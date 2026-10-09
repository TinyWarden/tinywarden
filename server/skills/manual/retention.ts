import{sql,type Kysely,type Transaction}from"kysely";
import type{Database}from"../../db/types";
export async function previewManualExpiry(trx:Transaction<Database>,cutoff:Date){
  return !!await trx.selectFrom("skill_manual_runs").select("id").where("requested_at","<",cutoff).limit(1).executeTakeFirst();
}
export async function pruneManualBatch(db:Kysely<Database>,cutoff:Date){
  const result=await sql`DELETE FROM tinywarden.skill_manual_runs WHERE id IN
    (SELECT id FROM tinywarden.skill_manual_runs WHERE requested_at<${cutoff} ORDER BY requested_at,id LIMIT 100)`.execute(db);
  return Number(result.numAffectedRows??0);
}
