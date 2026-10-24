import type {Kysely} from 'kysely';
import type {Database} from '../db/types';
import {exactObject} from '../validation';
import {fail} from '../errors';
import {nextCounter} from '../skills/catalog/package-commands';
import {fleetAudit} from '../fleet/management';
import {terminalMaintenance} from '../../lib/maintenance/policy';
import {maintenanceDigest} from './validation';
import {recoveryAcceptance,recoveryFinalization} from './recovery-validation';
import {recoveryReply,recoveryRoot,unconsumedRecovery} from './recovery-authority';
import {finishMaintenance} from './progress';

export async function recoverMaintenance(db:Kysely<Database>,token:string,mode:'describe'|'accept'|'finalize',raw:unknown,clock:()=>Date){
 return db.transaction().execute(async trx=>{
  const {row,job}=await recoveryRoot(trx,token),at=clock();
  if(at<row.created_at)fail('temporarily_unavailable',503);
  if(mode==='describe'){
   const input=exactObject(raw,['schema_version']);if(input.schema_version!==1)fail('invalid_request',400);
   if(!row.accepted_at)await unconsumedRecovery(trx,row,job,at);
   return recoveryReply(row);
  }
  if(mode==='accept'){
   const input=recoveryAcceptance(raw,row.scope),sha=maintenanceDigest(input);
   if(row.accepted_at){if(row.acceptance_sha256!==sha)fail('idempotency_conflict',409);return recoveryReply(row);}
   await unconsumedRecovery(trx,row,job,at);
   await trx.updateTable('maintenance_jobs').set({attention:true,recovery_pending:true,revision:nextCounter(job.revision),updated_at:at}).where('id','=',job.id).execute();
   const accepted=await trx.updateTable('maintenance_recoveries').set({accepted_at:at,acceptance:input,acceptance_sha256:sha}).where('id','=',row.id).returningAll().executeTakeFirstOrThrow();
   await fleetAudit(trx,row.operator_id,job.host_id,'maintenance_recovery_accepted',at,job.operation_id,{job_id:job.id,recovery_id:row.id});
   return recoveryReply(accepted);
  }
  if(!row.acceptance||!row.acceptance_sha256)fail('maintenance_reconciliation_required',409);
  const input=recoveryFinalization(raw,row.scope,row.acceptance,row.acceptance_sha256),sha=maintenanceDigest(input);
  if(row.finalized_at){if(row.finalization_sha256!==sha)fail('idempotency_conflict',409);return recoveryReply(row);}
  if(!job.recovery_pending||job.recovery_id!==row.id)fail('maintenance_scope_changed',409);
  const wasTerminal=terminalMaintenance(job.phase);
  if(!wasTerminal)await finishMaintenance(trx,job,'failed',job.result??{
   effect:job.apply_attempt?'unknown':job.effect,reason:'maintenance_reconciled_unknown',process_running:false,local_verified:false,facts:{}},at,true);
  // Original terminal result is historical. Recovery/current process state is separate.
  await trx.updateTable('maintenance_jobs').set({attention:false,recovery_pending:false,process_running:false,reconciled_at:at,
   cancel_requested:true,...(!wasTerminal?{reason:'maintenance_reconciled_unknown'}:{}),updated_at:at,revision:nextCounter(job.revision)}).where('id','=',job.id).execute();
  const finalized=await trx.updateTable('maintenance_recoveries').set({finalized_at:at,finalization:input,finalization_sha256:sha}).where('id','=',row.id).returningAll().executeTakeFirstOrThrow();
  await fleetAudit(trx,row.operator_id,job.host_id,'maintenance_reconciled',at,job.operation_id,{job_id:job.id,recovery_id:row.id});
  return recoveryReply(finalized);
 });
}
