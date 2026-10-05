import { randomUUID } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type { Database } from "../../db/types";
import { audit } from "../../access/audit";
import { packageLock, type PackageDb } from "../catalog/package-commands";
import { retentionBatchSize, retentionDays } from "./retention-policy";
export async function previewPackageExpiry(trx:Transaction<Database>,cutoff:Date){
  const readings=await trx.selectFrom("skill_observations").select("id").where("received_at","<",cutoff).limit(retentionBatchSize+1).execute();
  const states=await trx.selectFrom("skill_states").select("agent_id").where("updated_at","<",cutoff).limit(retentionBatchSize+1).execute();
  return {readings:Math.min(readings.length,retentionBatchSize),states:Math.min(states.length,retentionBatchSize),more:readings.length>retentionBatchSize||states.length>retentionBatchSize};
}
export async function prunePackageBatch(db:PackageDb,cutoff:Date,at:Date){
  return db.transaction().execute(async(trx)=>{
    await sql`SET LOCAL statement_timeout='5s'`.execute(trx);await sql`SET LOCAL transaction_timeout='5s'`.execute(trx);await sql`SET LOCAL lock_timeout='250ms'`.execute(trx);
    await packageLock(trx);
    const rows=await trx.selectFrom("skill_observations").select("id").where("received_at","<",cutoff).orderBy("received_at").orderBy("id").limit(retentionBatchSize).forUpdate().execute();
    const states=await trx.selectFrom("skill_states").select(["installation_id","agent_id"]).where("updated_at","<",cutoff)
      .orderBy("updated_at").orderBy("installation_id").orderBy("agent_id").limit(retentionBatchSize-rows.length).forUpdate().execute();
    for(const state of states)await trx.deleteFrom("skill_states").where("installation_id","=",state.installation_id).where("agent_id","=",state.agent_id).execute();
    if(rows.length)await trx.deleteFrom("skill_observations").where("id","in",rows.map((r)=>r.id)).execute();
    const parents=rows.length+states.length;
    if(parents)await audit(trx,{action:"observation.retention_pruned",actorKind:"system",at,correlationId:randomUUID(),retentionFamily:"packages",
      retentionCutoff:cutoff,retentionDays,retentionParentCount:parents,retentionMountCount:0});
    return {parents,readings:rows.length,states:states.length};
  });
}
