import {randomUUID} from 'node:crypto';
import type {Transaction} from 'kysely';
import type {Database} from '../db/types';
import {fail} from '../errors';
import type {MaintenanceDelivery} from '../../lib/maintenance/contracts';
import {maintenanceLimits,terminalMaintenance} from '../../lib/maintenance/policy';
import {enabledAdministrator,preparationAuthority,assertVerificationCoverage,type MaintenanceJobRow} from './authority';
import {verificationSnapshot,localVerificationSnapshot} from './verification';
import {actionDefinition,jobRow} from './progress';
import {nextCounter} from '../skills/catalog/package-commands';

type Trx=Transaction<Database>;
/** An approval records the reviewed canary/order. Another approval cannot bypass
 * an unfinished/uncertain transaction in the same parent operation. */
export async function executionTurn(trx:Trx,job:MaintenanceJobRow){
 if(!job.approval_id)return false;
 const approval=await trx.selectFrom('maintenance_approvals').selectAll().where('id','=',job.approval_id).executeTakeFirstOrThrow();
 const jobs=await trx.selectFrom('maintenance_jobs').selectAll().where('operation_id','=',job.operation_id).execute();
 if(job.action_binding&&!actionDefinition(job).requires_approval&&jobs.some(j=>j.ordinal<job.ordinal&&!['succeeded','no_changes'].includes(j.phase)))return false;
 if(jobs.some(j=>j.id!==job.id&&(j.attention||j.apply_attempt&&!terminalMaintenance(j.phase))))return false;
 for(const target of approval.targets){
  const previous=jobs.find(j=>j.id===target.job_id);
  if(!previous||previous.attention||previous.cancel_requested)return false;
  if(previous.id===job.id)return true;
  if(!['succeeded','no_changes'].includes(previous.phase)||!previous.result?.local_verified||previous.result.process_running)return false;
 }
 return false;
}
export async function grantMaintenance(trx:Trx,job:MaintenanceJobRow,at:Date){
 if(job.phase!=='downloading'||job.apply_attempt||job.cancel_requested||job.attention||!job.plan_id||!job.approval_id)fail('maintenance_start_invalid',409);
 await preparationAuthority(trx,job,at,true);
 const plan=await trx.selectFrom('maintenance_plans').selectAll().where('id','=',job.plan_id).executeTakeFirstOrThrow();
 const approval=await trx.selectFrom('maintenance_approvals').selectAll().where('id','=',job.approval_id).executeTakeFirstOrThrow();
 await enabledAdministrator(trx,approval.operator_id);
 if(job.expires_at<=at||plan.expires_at<=at)fail('maintenance_expired',409);
 if(approval.operation_id!==job.operation_id||approval.policy_revision!==(job.action_binding?'skill_actions.v1':'maintenance_jobs.v1')||!approval.targets.some(t=>t.job_id===job.id&&t.plan_id===plan.id&&t.digest===plan.digest))fail('maintenance_plan_changed',409);
 await assertVerificationCoverage(trx,job.host_id,plan.verification,at);
 if(!await executionTurn(trx,job))fail('maintenance_batch_wait',409);
 const attempt=randomUUID(),expires=new Date(Math.min(+at+maintenanceLimits.grantSeconds*1000,+plan.expires_at,+job.expires_at));
 await trx.updateTable('maintenance_jobs').set({phase:'applying',apply_attempt:attempt,apply_started_at:at,grant_expires_at:expires,process_running:true,updated_at:at})
  .where('id','=',job.id).execute();
 return jobRow(trx,job.id);
}
export async function maintenanceDelivery(trx:Trx,initial:MaintenanceJobRow,at:Date,includeGrant=false):Promise<MaintenanceDelivery|null>{
 let job=initial;
 if(job.recovery_pending)return null;
 if(job.phase==='queued'&&!job.cancel_requested){
  const peers=await trx.selectFrom('maintenance_jobs').select(['id','phase','attention','ordinal']).where('operation_id','=',job.operation_id).execute();
  if(peers.some(p=>p.attention||['blocked','failed','expired','cancelled'].includes(p.phase)))return null;
  const inflight=peers.filter(p=>p.phase==='preparing').length;
  const waiting=peers.filter(p=>p.phase==='queued').sort((a,b)=>a.ordinal-b.ordinal);
  if(inflight>=maintenanceLimits.prepareConcurrency||!waiting.slice(0,maintenanceLimits.prepareConcurrency-inflight).some(j=>j.id===job.id))return null;
  const host=await preparationAuthority(trx,job,at,true);
  const baseline=job.action_binding&&(job.action_snapshot?.descriptor.verification==='local'||host.lifecycle==='paused'&&!actionDefinition(job).requires_monitoring)?
   await localVerificationSnapshot(trx,job.host_id,at):job.action_binding||actionDefinition(job).requires_monitoring?await verificationSnapshot(trx,job.host_id,at):null;
  await trx.updateTable('maintenance_jobs').set({phase:'preparing',baseline,delivered_at:at,updated_at:at,revision:nextCounter(job.revision)}).where('id','=',job.id).execute();
  job=await jobRow(trx,job.id);
 }
 if(['approved','downloading'].includes(job.phase)&&!job.cancel_requested&&!await executionTurn(trx,job))return null;
 const plan=job.plan_id?await trx.selectFrom('maintenance_plans').selectAll().where('id','=',job.plan_id).executeTakeFirst():null;
 return {id:job.id,scope:{host_id:job.host_id,agent_id:job.agent_id,generation:Number(job.generation)},action:job.action,provider_version:job.provider_version,
  phase:job.phase,attention:job.attention,cancel_requested:job.cancel_requested,expires_at:job.expires_at.toISOString(),plan_id:job.plan_id,
  provider_sha256:plan?.provider_sha256??job.upload_sha256,plan_sha256:plan?.digest??null,approval_id:job.approval_id,
  grant:includeGrant&&job.apply_attempt&&job.apply_started_at&&job.grant_expires_at?{attempt_id:job.apply_attempt,issued_at:job.apply_started_at.toISOString(),expires_at:job.grant_expires_at.toISOString()}:null,result:job.result,
  ...(job.action_binding?{binding:job.action_binding,input_json:job.input_json!,settings_json:job.settings_json!,archive:job.action_archive!}:{})};
}
