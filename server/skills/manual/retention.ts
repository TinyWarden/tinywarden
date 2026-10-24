import {collectionReadRoot} from '../../fleet/management';
import {guardRetentionPass} from "../../data/retention-policy";
import{sql,type Kysely,type Transaction}from"kysely";
import type{Database}from"../../db/types";
export function manualExpiryCondition(cutoff:Date){return sql<boolean>`m.requested_at<${cutoff} AND NOT EXISTS(
 SELECT 1 FROM tinywarden.maintenance_verification_runs v JOIN tinywarden.maintenance_jobs j ON j.id=v.job_id
 WHERE v.manual_run_id=m.id AND (j.completed_at IS NULL OR j.attention OR j.process_running))`;}
export async function previewManualExpiry(trx:Transaction<Database>,cutoff:Date){
 return (await sql`SELECT id FROM tinywarden.skill_manual_runs m WHERE ${manualExpiryCondition(cutoff)} LIMIT 1`.execute(trx)).rows.length>0;
}
export async function pruneManualBatch(db:Kysely<Database>,cutoff:Date,policyRevision?:string){
 return db.transaction().execute(async trx=>{
 await guardRetentionPass(trx,policyRevision);await collectionReadRoot(trx);
  const result=await sql`DELETE FROM tinywarden.skill_manual_runs WHERE id IN
    (SELECT id FROM tinywarden.skill_manual_runs m WHERE ${manualExpiryCondition(cutoff)} ORDER BY requested_at,id LIMIT 100)`.execute(trx);
  return Number(result.numAffectedRows??0);
 });
}
