import type {Kysely} from 'kysely';
import type {Database} from '../db/types';
import {managementRoot,managementFinish,fleetAudit} from '../fleet/management';
import {exactObject,uuid,sameDigest} from '../validation';
import {commandFingerprint,nextCounter} from '../skills/catalog/package-commands';
import {fail} from '../errors';
import {lockOperation} from './authority';
import {requestMaintenanceStop,advanceMaintenance} from './progress';
import {terminalMaintenance} from '../../lib/maintenance/policy';

/** Control is explicit, scoped and replayable. Closing a dialog is never control. */
export async function controlMaintenance(db:Kysely<Database>,cookie:string,raw:unknown,clock:()=>Date){
 const v=exactObject(raw,['request_id','operation_id','action','targets']);
 const request=uuid(v.request_id),operation=uuid(v.operation_id);
 if(!['cancel','acknowledge'].includes(String(v.action))||!Array.isArray(v.targets)||!v.targets.length||v.targets.length>100)fail('invalid_request',400);
 const targets=v.targets.map(raw=>{const x=exactObject(raw,['job_id','revision']);
  if(typeof x.revision!=='string'||! /^[1-9][0-9]{0,15}$/.test(x.revision))fail('invalid_request',400);
  return {job_id:uuid(x.job_id),revision:x.revision};}).sort((a,b)=>a.job_id.localeCompare(b.job_id));
 if(new Set(targets.map(t=>t.job_id)).size!==targets.length)fail('invalid_request',400);
 const fingerprint=commandFingerprint('maintenance_control',operation,v.action,targets);
 return db.transaction().execute(async trx=>{
  const actor=await managementRoot(trx,cookie,clock),at=actor.at;
  const prior=await trx.selectFrom('fleet_operations').selectAll().where('id','=',request).executeTakeFirst();
  if(prior){if(prior.operator_id!==actor.operatorId||!sameDigest(prior.fingerprint,fingerprint))fail('idempotency_conflict',409);
   return {id:request,access:await managementFinish(trx,actor,clock)};}
  const {jobs}=await lockOperation(trx,operation);
  for(const target of targets){
   const job=jobs.find(j=>j.id===target.job_id);
   if(!job||job.revision!==target.revision)fail('maintenance_plan_changed',409);
   if(job.recovery_pending)fail('maintenance_reconciliation_required',409);
   if(v.action==='cancel'){
    await requestMaintenanceStop(trx,job,'maintenance_cancelled',at);
   }else{
    if(!job.attention||!terminalMaintenance(job.phase)||job.process_running||!(job.reconciled_at||job.result?.local_verified))fail('maintenance_reconciliation_required',409);
    await trx.updateTable('maintenance_jobs').set({attention:false,updated_at:at,revision:nextCounter(job.revision)}).where('id','=',job.id).execute();
   }
   await fleetAudit(trx,actor.operatorId,job.host_id,'maintenance_'+String(v.action),at,operation,{job_id:job.id});
  }
  await trx.insertInto('fleet_operations').values({id:request,operator_id:actor.operatorId,kind:'maintenance_control',fingerprint,payload:{operation_id:operation,action:v.action,targets},created_at:at}).execute();
  return {id:request,access:await managementFinish(trx,actor,clock)};
 });
}

/** Timers reconcile deadlines, not native outcomes. Package gate avoids granting
 * another host while a predecessor is being classified. Work stays bounded. */
export async function settleMaintenanceOperation(db:Kysely<Database>,cookie:string,id:string,clock:()=>Date){
 return db.transaction().execute(async trx=>{
  const actor=await managementRoot(trx,cookie,clock);const {jobs}=await lockOperation(trx,uuid(id));
  for(const job of jobs)await advanceMaintenance(trx,job,actor.at);
  return {access:await managementFinish(trx,actor,clock)};
 });
}
