import {randomUUID,createHash} from 'node:crypto';
import type {Transaction} from 'kysely';
import type {Database} from '../db/types';
import {fail} from '../errors';
import type {MaintenanceJobRow} from './authority';
import {maintenanceLimits,maintenanceActions,registeredAction} from '../../lib/maintenance/policy';
import {canonicalMaintenance,maintenanceDigest} from './validation';
import {providerPlan} from './providers';
import {verificationProgress} from './verification-runs';

/** Root-generated canonical bytes only; browser requests never contain executable plans. */
export async function preparedNotice(trx:Transaction<Database>,job:MaintenanceJobRow,data:Record<string,unknown>,at:Date){
 if(job.phase!=='preparing'||job.upload_sha256!==null||!job.baseline)fail('maintenance_plan_changed',409);
 const remaining=maintenanceLimits.planSeconds*1000-Number(data.age_ms);
 if(remaining<=0||job.expires_at<=at)fail('maintenance_expired',409);
 await trx.updateTable('maintenance_jobs').set({upload_sha256:String(data.provider_sha256),upload_parts:Number(data.parts),
  prepared_at:at,plan_expires_at:new Date(Math.min(+at+remaining,+job.expires_at)),effect:registeredAction(maintenanceActions,job.action)?.prepare_effect??'none',updated_at:at}).where('id','=',job.id).execute();
}
export async function planChunk(trx:Transaction<Database>,job:MaintenanceJobRow,data:Record<string,unknown>,at:Date){
 if(job.phase!=='preparing'||job.upload_sha256!==data.provider_sha256||job.upload_parts!==data.total||!job.plan_expires_at||job.plan_expires_at<=at)fail('maintenance_plan_changed',409);
 const count=await trx.selectFrom('maintenance_plan_parts').select(eb=>eb.fn.countAll<string>().as('count')).where('job_id','=',job.id).executeTakeFirstOrThrow();
 if(Number(count.count)!==data.part)fail('maintenance_sequence_conflict',409);
 await trx.insertInto('maintenance_plan_parts').values({job_id:job.id,part:Number(data.part),total:Number(data.total),provider_sha256:String(data.provider_sha256),content:String(data.content),received_at:at}).execute();
}
export async function readUploadedPlan(trx:Transaction<Database>,job:MaintenanceJobRow){
 if(!job.upload_parts||!job.upload_sha256)return null;
 const parts=await trx.selectFrom('maintenance_plan_parts').selectAll().where('job_id','=',job.id).orderBy('part').execute();
 if(parts.length!==job.upload_parts)return null;
 if(parts.some((p,i)=>p.part!==i||p.total!==job.upload_parts||p.provider_sha256!==job.upload_sha256))fail('maintenance_plan_changed',409);
 const raw=Buffer.concat(parts.map(p=>Buffer.from(p.content,'base64')));
 if(raw.length>maintenanceLimits.planBytes||createHash('sha256').update(raw).digest('hex')!==job.upload_sha256)fail('maintenance_plan_changed',409);
 let decoded:unknown;try{decoded=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{fail('maintenance_plan_changed',409);}
 const provider=providerPlan(job.action,decoded);
 if(maintenanceDigest(provider.plan)!==job.upload_sha256||!raw.equals(Buffer.from(canonicalMaintenance(provider.plan))))fail('maintenance_plan_changed',409);
 return provider;
}
/** Preparation includes a fresh generic baseline after the index-refresh boundary. */
export async function finalizePlan(trx:Transaction<Database>,job:MaintenanceJobRow,at:Date){
 if(job.phase!=='preparing'||!job.prepared_at||!job.baseline||job.plan_id)return {state:'pending' as const};
 if(!job.plan_expires_at||job.plan_expires_at<=at)return {state:'failed' as const,reason:'maintenance_expired'};
 const operation=await trx.selectFrom('fleet_operations').select('operator_id').where('id','=',job.operation_id).executeTakeFirstOrThrow();
 const verification=await verificationProgress(trx,{job:job.id,host:job.host_id,operator:operation.operator_id,baseline:job.baseline,stage:'baseline',notBefore:job.prepared_at,at});
 if(verification.state!=='verified')return verification;
 const uploaded=await readUploadedPlan(trx,job);if(!uploaded)return {state:'pending' as const};
 if(!uploaded.has_changes&&!uploaded.no_changes_result)fail('maintenance_plan_changed',409);
 const envelope={provider:uploaded.plan,provider_sha256:job.upload_sha256!,verification:verification.snapshot,verification_sha256:maintenanceDigest(verification.snapshot)};
 const plan=randomUUID();
 await trx.insertInto('maintenance_plans').values({id:plan,job_id:job.id,provider_plan:uploaded.plan,verification:verification.snapshot,
  provider_sha256:job.upload_sha256!,verification_sha256:envelope.verification_sha256,digest:maintenanceDigest(envelope),created_at:job.prepared_at,expires_at:job.plan_expires_at}).execute();
 await trx.updateTable('maintenance_jobs').set({plan_id:plan,phase:uploaded.has_changes?'awaiting_approval':'no_changes',updated_at:at,
  ...(uploaded.has_changes?{}:{completed_at:at,result:uploaded.no_changes_result!})}).where('id','=',job.id).execute();
 return {state:'ready' as const,plan_id:plan};
}
