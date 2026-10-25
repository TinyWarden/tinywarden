import {randomBytes,createHash} from 'node:crypto';
import type {Kysely,Selectable,Transaction} from 'kysely';
import type {Database} from '../db/types';
import type {MaintenanceTables} from '../db/maintenance-types';
import type {RecoveryScope,RecoveryReply} from '../../lib/maintenance/recovery';
import {exactObject,uuid,sameDigest} from '../validation';
import {revision,managementRoot,managementFinish,fleetAudit,collectionReadRoot} from '../fleet/management';
import {commandFingerprint,nextCounter} from '../skills/catalog/package-commands';
import {accessGate} from '../access/scope';
import {fail} from '../errors';
import {maintenanceLimits,terminalMaintenance} from '../../lib/maintenance/policy';
import {enabledAdministrator,lockOperation,type MaintenanceJobRow} from './authority';
import {requestMaintenanceStop,jobRow} from './progress';

export type RecoveryRow=Selectable<MaintenanceTables['maintenance_recoveries']>;
export const tokenDigest=(token:string)=>createHash('sha256').update(token).digest();
export function recoveryTokenID(token:string){
 const match=/^tw_recovery_v1\.([a-f0-9-]{36})\.[A-Za-z0-9_-]{43}$/.exec(token);if(!match)fail('unauthorized',401);
 return uuid(match[1]);
}
/** Header-only admission before bounded slow body input; transaction rechecks it. */
export async function admitRecovery(db:Kysely<Database>,token:string){
 const row=await db.selectFrom('maintenance_recoveries').select(['token_digest','scope']).where('id','=',recoveryTokenID(token)).executeTakeFirst();
 if(!row||!sameDigest(row.token_digest,tokenDigest(token)))fail('unauthorized',401);
 return row.scope.binding?512*1024:65536;
}
export function recoveryReply(row:RecoveryRow):RecoveryReply{return {schema_version:row.scope.binding?2:1,recovery_id:row.id,scope:row.scope,
 expires_at:row.expires_at.toISOString(),state:row.finalized_at?'finalized':row.accepted_at?'accepted':'issued',
 acceptance_sha256:row.acceptance_sha256,finalization_sha256:row.finalization_sha256};}
export async function recoveryScope(trx:Transaction<Database>,job:MaintenanceJobRow,id:string):Promise<RecoveryScope>{
 const plan=job.plan_id?await trx.selectFrom('maintenance_plans').selectAll().where('id','=',job.plan_id).executeTakeFirstOrThrow():null;
 return {recovery_id:id,job_id:job.id,operation_id:job.operation_id,host_id:job.host_id,agent_id:job.agent_id,generation:Number(job.generation),
  action:job.action,provider_version:job.provider_version,job_expires_at:job.expires_at.toISOString(),revision:job.revision,
  plan_id:job.plan_id,provider_sha256:plan?.provider_sha256??job.upload_sha256,plan_sha256:plan?.digest??null,approval_id:job.approval_id,apply_attempt:job.apply_attempt,
  ...(job.action_binding?{binding:job.action_binding,input_json:job.input_json!,settings_json:job.settings_json!,archive:job.action_archive!}:{})};
}
export async function issueRecovery(db:Kysely<Database>,cookie:string,raw:unknown,clock:()=>Date){
 const v=exactObject(raw,['request_id','operation_id','job_id','revision']);
 const id=uuid(v.request_id),operation=uuid(v.operation_id),jobID=uuid(v.job_id),expected=revision(v.revision);
 const fp=commandFingerprint('maintenance_recovery',operation,jobID,expected);
 return db.transaction().execute(async trx=>{
  const actor=await managementRoot(trx,cookie,clock),at=actor.at;
  const {jobs}=await lockOperation(trx,operation);
  const previous=await trx.selectFrom('maintenance_recoveries').selectAll().where('id','=',id).executeTakeFirst();
  if(previous){if(previous.operator_id!==actor.operatorId||!sameDigest(previous.fingerprint,fp))fail('idempotency_conflict',409);
   return {...recoveryReply(previous),token:null,access:await managementFinish(trx,actor,clock)};}
  const job=jobs.find(j=>j.id===jobID);
  if(!job||job.revision!==expected)fail('maintenance_plan_changed',409);
  if(job.recovery_pending||!job.attention&&terminalMaintenance(job.phase)||!job.delivered_at&&!job.attention)fail('maintenance_reconciliation_required',409);
  await trx.updateTable('maintenance_recoveries').set({revoked_at:at}).where('job_id','=',job.id).where('accepted_at','is',null).where('revoked_at','is',null).execute();
  for(const peer of jobs)await requestMaintenanceStop(trx,peer,'maintenance_cancelled',at);
  const current=await jobRow(trx,job.id);
  await trx.updateTable('maintenance_jobs').set({cancel_requested:true,recovery_id:id,updated_at:at,revision:nextCounter(current.revision)}).where('id','=',job.id).execute();
  const scope=await recoveryScope(trx,await jobRow(trx,job.id),id);
  const token='tw_recovery_v1.'+id+'.'+randomBytes(32).toString('base64url');
  const row=await trx.insertInto('maintenance_recoveries').values({id,job_id:job.id,operator_id:actor.operatorId,fingerprint:fp,token_digest:tokenDigest(token),scope,
   created_at:at,expires_at:new Date(+at+maintenanceLimits.recoverySeconds*1000)}).returningAll().executeTakeFirstOrThrow();
  await fleetAudit(trx,actor.operatorId,job.host_id,'maintenance_recovery_issued',at,operation,{job_id:job.id,recovery_id:id});
  return {...recoveryReply(row),token,access:await managementFinish(trx,actor,clock)};
 });
}
export async function revokeRecovery(db:Kysely<Database>,cookie:string,id:string,clock:()=>Date){
 return db.transaction().execute(async trx=>{
  const actor=await managementRoot(trx,cookie,clock);
  const ref=await trx.selectFrom('maintenance_recoveries').selectAll().where('id','=',uuid(id)).executeTakeFirst();if(!ref)fail('not_found',404);
  await lockOperation(trx,ref.scope.operation_id);
  const row=await trx.selectFrom('maintenance_recoveries').selectAll().where('id','=',ref.id).forUpdate().executeTakeFirstOrThrow();
  if(row.accepted_at)fail('maintenance_recovery_committed',409);
  if(!row.revoked_at){await trx.updateTable('maintenance_recoveries').set({revoked_at:actor.at}).where('id','=',row.id).execute();
   await fleetAudit(trx,actor.operatorId,row.scope.host_id,'maintenance_recovery_revoked',actor.at,row.scope.operation_id,{recovery_id:row.id});}
  return {access:await managementFinish(trx,actor,clock)};
 });
}
/** Recovery capabilities authorize only scoped receipts, never agent identity. */
export async function recoveryRoot(trx:Transaction<Database>,token:string){
 await accessGate(trx);await collectionReadRoot(trx);
 const ref=await trx.selectFrom('maintenance_recoveries').selectAll().where('id','=',recoveryTokenID(token)).executeTakeFirst();
 if(!ref||!sameDigest(ref.token_digest,tokenDigest(token)))fail('unauthorized',401);
 const {jobs}=await lockOperation(trx,ref.scope.operation_id);
 const row=await trx.selectFrom('maintenance_recoveries').selectAll().where('id','=',ref.id).forUpdate().executeTakeFirstOrThrow();
 const job=jobs.find(j=>j.id===row.job_id);if(!job)fail('not_found',404);
 return {row,job};
}
export async function unconsumedRecovery(trx:Transaction<Database>,row:RecoveryRow,job:MaintenanceJobRow,at:Date){
 if(row.revoked_at||row.expires_at<=at)fail('maintenance_recovery_expired',409);
 await enabledAdministrator(trx,row.operator_id);
 if(job.recovery_id!==row.id||job.revision!==row.scope.revision||job.recovery_pending)fail('maintenance_plan_changed',409);
}
