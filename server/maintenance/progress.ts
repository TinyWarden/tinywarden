import type {Transaction} from 'kysely';
import type {Database} from '../db/types';
import type {MaintenanceJobRow} from './authority';
import {AppError,fail} from '../errors';
import {maintenanceActions,maintenanceLimits,registeredAction,terminalMaintenance} from '../../lib/maintenance/policy';
import {nextCounter} from '../skills/catalog/package-commands';
import {fleetAudit} from '../fleet/management';
import type {MaintenanceResult,MaintenancePhase} from '../../lib/maintenance/contracts';
import {preparationAuthority} from './authority';
import {finalizePlan} from './plans';
import {verificationProgress} from './verification-runs';

type Trx=Transaction<Database>;
export async function jobRow(trx:Trx,id:string){return trx.selectFrom('maintenance_jobs').selectAll().where('id','=',id).executeTakeFirstOrThrow();}
/** Terminal native proof and operator attention are separate. A deadline cannot
 * turn an uncertain process into a safe terminal receipt. */
export async function finishMaintenance(trx:Trx,job:MaintenanceJobRow,phase:MaintenancePhase,result:MaintenanceResult,at:Date,attention=job.attention,provenNotStarted=false){
 if(!terminalMaintenance(phase))fail('maintenance_transition_invalid',409);
 if((phase==='succeeded'||phase==='no_changes')&&(!result.local_verified||result.process_running||result.reason))fail('maintenance_result_invalid',409);
 attention=attention||result.process_running||!provenNotStarted&&!!job.apply_attempt&&(phase!=='succeeded'&&phase!=='no_changes');
 await trx.updateTable('maintenance_jobs').set({phase,result,effect:result.effect,reason:result.reason,process_running:result.process_running,attention,
  completed_at:at,updated_at:at,revision:nextCounter(job.revision)}).where('id','=',job.id).execute();
 await trx.updateTable('fleet_operation_items').set({state:phase==='succeeded'||phase==='no_changes'?'completed':'failed',outcome:result.reason??'maintenance_'+phase,completed_at:at})
  .where('operation_id','=',job.operation_id).where('host_id','=',job.host_id).execute();
 await fleetAudit(trx,null,job.host_id,'maintenance_'+phase,at,job.operation_id,{job_id:job.id,effect:result.effect,attention});
}
export function stoppedResult(job:MaintenanceJobRow,reason:string):MaintenanceResult{
 return {effect:job.effect,reason,local_verified:false,process_running:false,facts:{}};
}
export async function requestMaintenanceStop(trx:Trx,job:MaintenanceJobRow,reason:string,at:Date){
 if(job.recovery_pending)return;
 if(terminalMaintenance(job.phase))return;
 if(!job.delivered_at&&!job.apply_attempt){
  await finishMaintenance(trx,job,reason==='maintenance_expired'?'expired':reason==='maintenance_cancelled'?'cancelled':'blocked',stoppedResult(job,reason),at);return;
 }
 // An issued grant is irreversible server intent, even before the start receipt.
 await trx.updateTable('maintenance_jobs').set({cancel_requested:true,reason,updated_at:at,revision:nextCounter(job.revision)}).where('id','=',job.id).execute();
}
/** Called under access/package/host locks, including from a worker poll. */
export async function advanceMaintenance(trx:Trx,initial:MaintenanceJobRow,at:Date){
 let job=initial;
 if(job.recovery_pending)return job;
 if(terminalMaintenance(job.phase))return job;
 if(at<job.updated_at)fail('temporarily_unavailable',503);
 if(job.apply_attempt){
  const stalled=job.phase==='applying'&&job.apply_started_at&&+at-+job.apply_started_at>=maintenanceLimits.attentionSeconds*1000;
  if(stalled&&!job.attention){await trx.updateTable('maintenance_jobs').set({attention:true,reason:'maintenance_apply_stalled',updated_at:at}).where('id','=',job.id).execute();job=await jobRow(trx,job.id);}
 }else if(!job.cancel_requested){
  let reason:string|null=null;
  try{await preparationAuthority(trx,job,at,false);}catch(error){if(!(error instanceof AppError)||!error.code.startsWith('maintenance_'))throw error;reason=error.code;}
  if(job.expires_at<=at||job.plan_expires_at&&job.plan_expires_at<=at)reason='maintenance_expired';
  if(reason){await requestMaintenanceStop(trx,job,reason,at);job=await jobRow(trx,job.id);}
 }
 if(job.cancel_requested&&!job.apply_attempt||terminalMaintenance(job.phase))return job;
 if(job.phase==='preparing'&&job.prepared_at){
  const progress=await finalizePlan(trx,job,at);
  if(progress.state==='failed')await requestMaintenanceStop(trx,job,progress.reason,at);
  job=await jobRow(trx,job.id);
  if(job.phase==='no_changes'&&job.result)await finishMaintenance(trx,job,'no_changes',job.result,at);
 }
 if(job.phase==='verifying'&&job.result&&job.verification_requested_at){
  const plan=job.plan_id?await trx.selectFrom('maintenance_plans').selectAll().where('id','=',job.plan_id).executeTakeFirst():null;
  if(!plan)fail('maintenance_plan_changed',409);
  const operation=await trx.selectFrom('fleet_operations').select('operator_id').where('id','=',job.operation_id).executeTakeFirstOrThrow();
  const proof=await verificationProgress(trx,{job:job.id,host:job.host_id,operator:operation.operator_id,baseline:plan.verification,stage:'post',notBefore:job.verification_requested_at,at});
  // A maintenance reply is not monitoring/agent freshness. Require a new signed
  // platform observation and normal authenticated contact after native completion.
  const report=await trx.selectFrom('agent_platform_reports').selectAll().where('agent_id','=',job.agent_id).where('generation','=',job.generation).executeTakeFirst();
  const credentials=await trx.selectFrom('agent_credentials').select(['accepted_at','last_contact_at']).where('agent_id','=',job.agent_id).where('generation','=',job.generation).where('revoked_at','is',null).execute();
  const contact=credentials.some(c=>c.accepted_at&&c.accepted_at>job.verification_requested_at!||c.last_contact_at&&c.last_contact_at>job.verification_requested_at!);
  let identity=false;
  try{await preparationAuthority(trx,job,at,true);identity=true;}catch(error){if(!(error instanceof AppError))throw error;}
  if(proof.state==='failed')await finishMaintenance(trx,job,'failed',{...job.result,reason:proof.reason},at,true);
  else if(proof.state==='verified'&&contact&&identity&&report&&report.observed_at>=job.verification_requested_at&&report.received_at>job.verification_requested_at){
   await finishMaintenance(trx,job,'succeeded',job.result,at);
  }else if(+at-+job.verification_requested_at>=maintenanceLimits.verifySeconds*1000){
   await finishMaintenance(trx,job,'failed',{...job.result,reason:'maintenance_verification_timeout'},at,true);
  }
 }
 return jobRow(trx,job.id);
}
export function actionDefinition(job:MaintenanceJobRow){const action=registeredAction(maintenanceActions,job.action);if(!action)fail('maintenance_provider_unavailable',409);return action;}
