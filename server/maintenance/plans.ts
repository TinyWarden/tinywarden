import {randomUUID,createHash} from 'node:crypto';
import type {Transaction} from 'kysely';
import type {Database} from '../db/types';
import {fail} from '../errors';
import type {MaintenanceJobRow} from './authority';
import {maintenanceLimits} from '../../lib/maintenance/policy';
import {maintenanceDigest} from './validation';
import {assertVerificationCoverage} from './verification';
import {actionDefinition} from './progress';
import {admittedActionPlan} from './action-plan';
import {commandFingerprint} from '../skills/catalog/package-commands';
import {jsonValue} from '../db/json';

/** Root-generated canonical bytes only; browser requests never contain executable plans. */
export async function preparedNotice(trx:Transaction<Database>,job:MaintenanceJobRow,data:Record<string,unknown>,at:Date){
 if(job.phase!=='preparing'||job.upload_sha256!==null||!job.baseline)fail('maintenance_plan_changed',409);
 const remaining=maintenanceLimits.planSeconds*1000-Number(data.age_ms);
 if(remaining<=0||job.expires_at<=at)fail('maintenance_expired',409);
 await trx.updateTable('maintenance_jobs').set({upload_sha256:String(data.provider_sha256),upload_parts:Number(data.parts),
  prepared_at:at,plan_expires_at:new Date(Math.min(+at+remaining,+job.expires_at)),effect:actionDefinition(job).prepare_effect??'none',updated_at:at}).where('id','=',job.id).execute();
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
 let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(raw);JSON.parse(text);}catch{fail('maintenance_plan_changed',409);}
 if(job.action_binding&&job.action_snapshot)return admittedActionPlan(job.action_snapshot,text);
 fail('maintenance_legacy_recovery_required',409);
}
/** Admit the skill plan against its own bound execution scope. */
export async function finalizePlan(trx:Transaction<Database>,job:MaintenanceJobRow,at:Date){
 if(job.phase!=='preparing'||!job.prepared_at||!job.baseline||job.plan_id)return {state:'pending' as const};
 if(!job.plan_expires_at||job.plan_expires_at<=at)return {state:'failed' as const,reason:'maintenance_expired'};
 const operation=await trx.selectFrom('fleet_operations').select('operator_id').where('id','=',job.operation_id).executeTakeFirstOrThrow();
 const verification=assertVerificationCoverage(job,job.baseline);
 const uploaded=await readUploadedPlan(trx,job);if(!uploaded)return {state:'pending' as const};
 if(!uploaded.has_changes&&!uploaded.no_changes_result)fail('maintenance_plan_changed',409);
 const verificationSHA=maintenanceDigest(verification);
 const envelope=job.action_binding?{binding:job.action_binding,authority:{enablement_version:job.action_enablement_version,monitoring_epoch:job.action_monitoring_epoch},scope:{host_id:job.host_id,agent_id:job.agent_id,generation:Number(job.generation)},provider_sha256:job.upload_sha256!,verification_sha256:verificationSHA}:
  {provider:uploaded.plan,provider_sha256:job.upload_sha256!,verification:verification,verification_sha256:verificationSHA};
 const digest=maintenanceDigest(envelope);
 const plan=randomUUID();
 await trx.insertInto('maintenance_plans').values({id:plan,job_id:job.id,provider_plan:uploaded.plan,provider_json:uploaded.provider_json,verification:verification,
  provider_sha256:job.upload_sha256!,verification_sha256:verificationSHA,digest,created_at:job.prepared_at,expires_at:job.plan_expires_at}).execute();
 const automatic=job.action_binding&&uploaded.has_changes&&!actionDefinition(job).requires_approval?randomUUID():null;
 if(automatic)await trx.insertInto('maintenance_approvals').values({id:automatic,operation_id:job.operation_id,operator_id:operation.operator_id,
  fingerprint:commandFingerprint('automatic_action_approval',job.id,digest,job.action_binding),targets:jsonValue([{job_id:job.id,plan_id:plan,digest}]),policy_revision:'skill_actions.v1',created_at:at}).execute();
 await trx.updateTable('maintenance_jobs').set({plan_id:plan,phase:uploaded.has_changes?(automatic?'approved':'awaiting_approval'):'no_changes',updated_at:at,
  ...(automatic?{approval_id:automatic}:{}),
  ...(uploaded.has_changes?{}:{completed_at:at,result:uploaded.no_changes_result!})}).where('id','=',job.id).execute();
 return {state:'ready' as const,plan_id:plan};
}
