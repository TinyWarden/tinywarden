import {sql,type Kysely,type Transaction} from 'kysely';
import type {Database} from '../db/types';
import {accessGate} from '../access/scope';
import {collectionReadRoot} from '../fleet/management';
import {authorizeAgent} from '../fleet/agent-authority';
import {commandFingerprint,nextCounter} from '../skills/catalog/package-commands';
import {sameDigest} from '../validation';
import {fail,AppError} from '../errors';
import {maintenanceAgentInput,maintenanceJobResult} from './wire';
import {maintenanceDelivery,executionTurn,grantMaintenance} from './delivery';
import {advanceMaintenance,actionDefinition,finishMaintenance,jobRow,requestMaintenanceStop} from './progress';
import {preparedNotice,planChunk} from './plans';
import type {MaintenanceJobRow} from './authority';
import type {MaintenanceAgentRequest,MaintenanceAgentReply} from '../../lib/maintenance/contracts';
import {canonicalMaintenance} from './validation';
import {saveActionPoll} from './action-readiness';
import {terminalMaintenance} from '../../lib/maintenance/policy';

type Trx=Transaction<Database>;
async function event(trx:Trx,job:MaintenanceJobRow,input:MaintenanceAgentRequest,at:Date){
 const kind=input.kind;
 if(terminalMaintenance(job.phase)&&kind!=='reconciled')fail('maintenance_transition_invalid',409);
 if(job.cancel_requested&&!['cancelled','failed','verifying','completed','start_declined','reconciled'].includes(kind))return job;
 switch(kind){
  case 'preparing':if(job.phase!=='preparing')fail('maintenance_transition_invalid',409);break;
  case 'prepared':await preparedNotice(trx,job,input.data,at);break;
  case 'plan_chunk':await planChunk(trx,job,input.data,at);break;
  case 'downloading':
   if(job.phase!=='approved'||!await executionTurn(trx,job))fail('maintenance_transition_invalid',409);
   await trx.updateTable('maintenance_jobs').set({phase:'downloading',updated_at:at}).where('id','=',job.id).execute();break;
  case 'ready':
   try{return await grantMaintenance(trx,job,at);}catch(error){
    if(!(error instanceof AppError)||!error.code.startsWith('maintenance_')||error.code==='maintenance_batch_wait')throw error;
    await requestMaintenanceStop(trx,job,error.code,at);
   }break;
  case 'verifying':{
   const result=maintenanceJobResult(input.data.result,actionDefinition(job));
   if(job.phase!=='applying'||!job.apply_attempt||result.reason||!result.local_verified||result.process_running)fail('maintenance_result_invalid',409);
   await trx.updateTable('maintenance_jobs').set({phase:'verifying',result,effect:result.effect,process_running:false,verification_requested_at:at,updated_at:at}).where('id','=',job.id).execute();break;
  }
  case 'completed':{
   const result=maintenanceJobResult(input.data.result,actionDefinition(job));
   if(job.action_binding||actionDefinition(job).requires_approval||job.phase!=='preparing'||!job.delivered_at)fail('maintenance_transition_invalid',409);
   await finishMaintenance(trx,job,'succeeded',result,at);break;
  }
  case 'failed':{
   const result=maintenanceJobResult(input.data.result,actionDefinition(job));
   if(!result.reason)fail('maintenance_result_invalid',409);
   await finishMaintenance(trx,job,'failed',result,at);break;
  }
  case 'cancelled':case 'start_declined':{
   if(kind==='cancelled'&&job.apply_attempt||kind==='start_declined'&&(!job.apply_attempt||job.phase!=='applying'))fail('maintenance_transition_invalid',409);
   const reason=job.reason??(kind==='start_declined'?'maintenance_start_expired':'maintenance_cancelled');
   // The root one-use journal explicitly proves this grant was not consumed.
   await finishMaintenance(trx,job,reason==='maintenance_expired'||kind==='start_declined'?'expired':'cancelled',
    {effect:job.effect,reason,process_running:false,local_verified:false,facts:{}},at,false,kind==='start_declined');break;
  }
  case 'reconciled':{
   const proof=maintenanceJobResult(input.data.result,actionDefinition(job));
   if(!job.attention||!proof.local_verified||proof.process_running)fail('maintenance_reconciliation_required',409);
   // Local audit is evidence, not operator acknowledgement or a successful retry.
   await trx.updateTable('maintenance_jobs').set({process_running:false,reconciled_at:at,updated_at:at}).where('id','=',job.id).execute();break;
  }
  default:fail('maintenance_transition_invalid',409);
 }
 return jobRow(trx,job.id);
}

/** A separate authenticated lane, not a heartbeat or arbitrary command channel.
 * Shared package gate serializes cross-host batch writes before host/job locks. */
export async function agentMaintenance(db:Kysely<Database>,credential:string,raw:unknown,clock:()=>Date):Promise<MaintenanceAgentReply>{
 const input=maintenanceAgentInput(raw),fingerprint=commandFingerprint('maintenance_event',input);
 return db.transaction().execute(async trx=>{
  await accessGate(trx);await collectionReadRoot(trx);
  const authority=await authorizeAgent(trx,credential,clock),at=authority.now;
  if(input.host_id!==authority.host.id||input.agent_id!==authority.agent.id||String(input.generation)!==authority.agent.current_generation)fail('unauthorized',401);
  const probes=input.schema_version===2&&input.kind==='poll'&&!input.job_id?await saveActionPoll(trx,input.agent_id,String(input.generation),input.data,at):{};
  let query=trx.selectFrom('maintenance_jobs').selectAll().where('host_id','=',input.host_id).where('agent_id','=',input.agent_id).where('generation','=',String(input.generation));
  query=query.where('action_binding',input.schema_version===2?'is not':'is',null);
  query=input.job_id?query.where('id','=',input.job_id):query.where(eb=>eb.or([eb('attention','=',true),eb('completed_at','is',null)]));
  let job=await query.orderBy('created_at').forUpdate().executeTakeFirst();
  if(input.job_id&&!job)fail('maintenance_job_unknown',409);
  if(job&&canonicalMaintenance(job.action_binding)!==canonicalMaintenance(input.binding??null)&&input.job_id)fail('maintenance_scope_changed',409);
  if(job?.recovery_pending)fail('maintenance_reconciliation_required',409);
  const envelope={schema_version:input.schema_version,host_id:input.host_id,agent_id:input.agent_id,generation:input.generation,
   capability:input.schema_version===2?'skill_actions.v1' as const:'maintenance_jobs.v1' as const,...probes,server_at:at.toISOString(),ack_sequence:input.sequence};
  if(job&&input.kind!=='poll'){
   const previous=await trx.selectFrom('maintenance_events').selectAll().where('job_id','=',job.id).where('sequence','=',String(input.sequence)).executeTakeFirst();
   if(previous){if(!sameDigest(previous.fingerprint,fingerprint))fail('idempotency_conflict',409);
    // The immutable decision is replayed, with a fresh server clock for grant age.
    return {...previous.reply,server_at:at.toISOString()} as MaintenanceAgentReply;}
   if(BigInt(job.last_sequence)+1n!==BigInt(input.sequence))fail('maintenance_sequence_conflict',409);
   job=await advanceMaintenance(trx,job,at);
   job=await event(trx,job,input,at);
   job=await advanceMaintenance(trx,job,at);
   const reply={...envelope,job:await maintenanceDelivery(trx,job,at,input.kind==='ready'&&!job.cancel_requested)};
   if(Buffer.byteLength(JSON.stringify(reply))>(input.schema_version===2?512*1024:65536))fail('maintenance_reply_too_large',409);
   await trx.insertInto('maintenance_events').values({job_id:job.id,sequence:input.sequence,fingerprint,phase:job.phase,facts:input.data,
    reply:sql<Record<string,unknown>>`${JSON.stringify(reply)}::jsonb`,received_at:at}).execute();
   await trx.updateTable('maintenance_jobs').set({last_sequence:input.sequence,revision:nextCounter(job.revision)}).where('id','=',job.id).execute();
   return reply;
  }
  if(job)job=await advanceMaintenance(trx,job,at);
  return {...envelope,job:job?await maintenanceDelivery(trx,job,at):null};
 });
}
