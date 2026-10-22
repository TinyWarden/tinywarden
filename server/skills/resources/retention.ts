import {guardRetentionPass} from "../../data/retention-policy";
import {sql,type Transaction} from "kysely";
import type {Database} from "../../db/types";
import {packageLock,type PackageDb} from "../catalog/package-commands";
import {retentionBatchSize} from "../results/retention-policy";
const unused=sql<boolean>`NOT EXISTS(SELECT 1 FROM tinywarden.history_subjects h WHERE h.resource_epoch=m.id)
 AND NOT EXISTS(SELECT 1 FROM tinywarden.history_events e WHERE e.resource_epoch=m.id)
 AND NOT EXISTS(SELECT 1 FROM tinywarden.notification_cursors c WHERE c.resource_epoch=m.id)`;
export async function previewResourceExpiry(trx:Transaction<Database>,cutoff:Date){
 const inventories=await trx.selectFrom('skill_resource_inventories').select('snapshot_id').where(eb=>eb.or([eb('captured_at','<',cutoff),eb('received_at','<',cutoff)])).limit(retentionBatchSize+1).execute();
 const members=await trx.selectFrom('skill_resource_memberships as m').select('m.id').where('m.retired_at','<',cutoff).where(unused).limit(retentionBatchSize+1).execute();
 const scans=await trx.selectFrom('skill_resource_scans').select('host_id').where('updated_at','<',cutoff).limit(1).execute();
 return {inventories:Math.min(inventories.length,retentionBatchSize),memberships:Math.min(members.length,retentionBatchSize),more:inventories.length+members.length+scans.length>0};
}
export async function pruneResourceBatch(db:PackageDb,cutoff:Date,policyRevision?:string){
 return db.transaction().execute(async trx=>{
  await guardRetentionPass(trx,policyRevision);
  await packageLock(trx);
  const inventories=await trx.selectFrom('skill_resource_inventories').select('snapshot_id').where(eb=>eb.or([eb('captured_at','<',cutoff),eb('received_at','<',cutoff)])).orderBy('captured_at').limit(retentionBatchSize).forUpdate().execute();
  if(inventories.length)await trx.deleteFrom('skill_resource_inventories').where('snapshot_id','in',inventories.map(r=>r.snapshot_id)).execute();
  const members=await trx.selectFrom('skill_resource_memberships as m').select('m.id').where('m.retired_at','<',cutoff).where(unused).orderBy('m.retired_at').limit(retentionBatchSize-inventories.length).forUpdate().execute();
  if(members.length)await trx.deleteFrom('skill_resource_memberships').where('id','in',members.map(r=>r.id)).execute();
  const scans=await trx.selectFrom('skill_resource_scans').selectAll().where('updated_at','<',cutoff).orderBy('updated_at').limit(retentionBatchSize-inventories.length-members.length).forUpdate().execute();
  for(const scan of scans)await trx.deleteFrom('skill_resource_scans').where('consumer','=',scan.consumer).where('scope','=',scan.scope).where('host_id','=',scan.host_id).execute();
  return {parents:inventories.length+members.length+scans.length,inventories:inventories.length,memberships:members.length};
 });
}
