import {sql,type Kysely} from 'kysely';
import type {Database} from '../db/types';
import {managementRoot,managementFinish,fleetAudit} from '../fleet/management';
import {commandFingerprint,nextCounter} from '../skills/catalog/package-commands';
import {exactObject,uuid,sameDigest} from '../validation';
import {fail} from '../errors';
import {digestText} from './validation';
import {lockOperation,preparationAuthority,assertVerificationCoverage} from './authority';
import {maintenanceLimits} from '../../lib/maintenance/policy';
import {actionDefinition} from './progress';

export function approvalInput(raw:unknown){
 const v=exactObject(raw,['request_id','operation_id','targets']);
 if(!Array.isArray(v.targets)||!v.targets.length||v.targets.length>maintenanceLimits.targets)fail('invalid_request',400);
 const targets=v.targets.map(raw=>{const t=exactObject(raw,['job_id','plan_id','digest']);return {job_id:uuid(t.job_id),plan_id:uuid(t.plan_id),digest:digestText(t.digest)};});
 if(new Set(targets.map(t=>t.job_id)).size!==targets.length)fail('invalid_request',400);
 return {request_id:uuid(v.request_id),operation_id:uuid(v.operation_id),targets};
}
export async function approveMaintenance(db:Kysely<Database>,cookie:string,raw:unknown,clock:()=>Date){
 const input=approvalInput(raw),fingerprint=commandFingerprint('maintenance_approval',input);
 return db.transaction().execute(async trx=>{
  const actor=await managementRoot(trx,cookie,clock),at=actor.at;
  const old=await trx.selectFrom('maintenance_approvals').selectAll().where('id','=',input.request_id).executeTakeFirst();
  if(old){if(old.operator_id!==actor.operatorId||!sameDigest(old.fingerprint,fingerprint))fail('idempotency_conflict',409);
   return {id:old.id,operation_id:old.operation_id,access:await managementFinish(trx,actor,clock)};}
  const {jobs}=await lockOperation(trx,input.operation_id);
  if(jobs.some(j=>!input.targets.some(t=>t.job_id===j.id)&&(j.attention||['approved','downloading','applying','verifying'].includes(j.phase))))fail('maintenance_batch_wait',409);
  for(const target of input.targets){
   const job=jobs.find(j=>j.id===target.job_id);
   if(!job||job.plan_id!==target.plan_id||job.phase!=='awaiting_approval'||job.attention||job.cancel_requested||!actionDefinition(job).requires_approval)fail('maintenance_plan_changed',409);
   if(job.expires_at<=at)fail('maintenance_expired',409);
   await preparationAuthority(trx,job,at);
   const plan=await trx.selectFrom('maintenance_plans').selectAll().where('id','=',target.plan_id).executeTakeFirstOrThrow();
   if(plan.digest!==target.digest||plan.expires_at<=at)fail('maintenance_plan_changed',409);
   await assertVerificationCoverage(trx,job.host_id,plan.verification,at);
  }
  await trx.insertInto('maintenance_approvals').values({id:input.request_id,operation_id:input.operation_id,operator_id:actor.operatorId,
   fingerprint,targets:sql<typeof input.targets>`${JSON.stringify(input.targets)}::jsonb`,policy_revision:jobs.find(j=>j.id===input.targets[0]!.job_id)?.action_binding?'skill_actions.v1':'maintenance_jobs.v1',created_at:at}).execute();
  for(const target of input.targets){
   const job=jobs.find(j=>j.id===target.job_id)!;
   await trx.updateTable('maintenance_jobs').set({phase:'approved',approval_id:input.request_id,updated_at:at,revision:nextCounter(job.revision)}).where('id','=',job.id).execute();
   await fleetAudit(trx,actor.operatorId,job.host_id,'maintenance_approved',at,input.operation_id,{job_id:job.id,approval_id:input.request_id});
  }
  return {id:input.request_id,operation_id:input.operation_id,access:await managementFinish(trx,actor,clock)};
 });
}
