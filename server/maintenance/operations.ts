import {randomUUID} from 'node:crypto';
import type {Kysely} from 'kysely';
import type {Database} from '../db/types';
import {managementRoot,managementFinish,fleetAudit} from '../fleet/management';
import {commandFingerprint} from '../skills/catalog/package-commands';
import {sameDigest,uuid} from '../validation';
import {fail} from '../errors';
import {maintenanceLimits} from '../../lib/maintenance/policy';
import {maintenanceInput} from './validation';
import {maintenanceReadiness} from './readiness';
import {reviewSummaryProjection} from './review-provider';
import type {PlanReviewSummary} from '../../lib/maintenance/review';

/** Enqueues preparation only. A new approval receipt is needed for package writes. */
export async function createMaintenanceOperation(db:Kysely<Database>,cookie:string,raw:unknown,clock:()=>Date){
 const input=maintenanceInput(raw),fingerprint=commandFingerprint('maintenance',input);
 return db.transaction().execute(async trx=>{
  const actor=await managementRoot(trx,cookie,clock),at=actor.at;
  const prior=await trx.selectFrom('fleet_operations').selectAll().where('id','=',input.request_id).executeTakeFirst();
  if(prior){if(prior.operator_id!==actor.operatorId||!sameDigest(prior.fingerprint,fingerprint))fail('idempotency_conflict',409);
   return {id:prior.id,access:await managementFinish(trx,actor,clock)};}
  const hosts=await trx.selectFrom('hosts').selectAll().where('id','in',input.targets.map(t=>t.id)).orderBy('id').forUpdate().execute();
  if(hosts.length!==input.targets.length)fail('not_found',404);
  if(hosts.some(h=>input.targets.find(t=>t.id===h.id)?.revision!==h.fleet_revision))fail('settings_conflict',409);
  await trx.insertInto('fleet_operations').values({id:input.request_id,operator_id:actor.operatorId,kind:'maintenance_action',payload:{action:input.action,targets:input.targets},fingerprint,created_at:at}).execute();
  for(const [ordinal,target] of input.targets.entries()){
   const host=hosts.find(h=>h.id===target.id)!;
   const readiness=await maintenanceReadiness(trx,host,at),action=readiness.actions.find(a=>a.id===input.action)!;
   const reason=action.reason??(!readiness.agent?'maintenance_agent_upgrade_required':null);
   await trx.insertInto('fleet_operation_items').values({operation_id:input.request_id,host_id:host.id,expected_revision:target.revision,state:reason?'failed':'pending',outcome:reason,revision:null,completed_at:reason?at:null}).execute();
   if(reason||!readiness.agent)continue;
   await trx.insertInto('maintenance_jobs').values({id:randomUUID(),operation_id:input.request_id,host_id:host.id,
    agent_id:readiness.agent.id,generation:readiness.agent.current_generation,action:input.action,provider_version:1,
    phase:'queued',reason:null,apply_attempt:null,grant_expires_at:null,apply_started_at:null,plan_id:null,approval_id:null,
    ordinal,result:null,created_at:at,expires_at:new Date(+at+maintenanceLimits.queueSeconds*1000),updated_at:at,completed_at:null}).execute();
   await fleetAudit(trx,actor.operatorId,host.id,'maintenance_queued',at,input.request_id,{action:input.action});
  }
  return {id:input.request_id,access:await managementFinish(trx,actor,clock)};
 });
}
export async function readMaintenanceOperation(db:Kysely<Database>,cookie:string,id:string,clock:()=>Date){
 id=uuid(id);return db.transaction().execute(async trx=>{
  const actor=await managementRoot(trx,cookie,clock,false);
  const operation=await trx.selectFrom('fleet_operations').select(['id','kind','created_at','payload']).where('id','=',id).executeTakeFirst();
  if(!operation||operation.kind!=='maintenance_action')fail('not_found',404);
  const items=await trx.selectFrom('fleet_operation_items as i').innerJoin('hosts as h','h.id','i.host_id')
   .leftJoin('maintenance_jobs as j',join=>join.onRef('j.host_id','=','i.host_id').onRef('j.operation_id','=','i.operation_id'))
   .leftJoin('maintenance_plans as p','p.id','j.plan_id')
   .select(['i.host_id','h.label','h.fleet_revision as host_revision','i.state','i.outcome','j.id as job_id','j.phase','j.attention','j.effect','j.reason','j.cancel_requested','j.plan_id','j.apply_attempt','j.updated_at','j.ordinal',
    'j.revision','j.delivered_at','j.process_running','j.reconciled_at','j.result','j.recovery_id','j.recovery_pending','j.approval_id','p.digest','p.expires_at as plan_expires_at',reviewSummaryProjection().$castTo<PlanReviewSummary|null>().as('review')])
   .where('i.operation_id','=',id).orderBy('j.ordinal').orderBy('i.host_id').execute();
  const recoveries=await trx.selectFrom('maintenance_recoveries as r').innerJoin('maintenance_jobs as j','j.recovery_id','r.id')
   .select(['r.id','r.job_id','r.expires_at','r.revoked_at','r.accepted_at','r.finalized_at']).where('j.operation_id','=',id).execute();
  const approvals=await trx.selectFrom('maintenance_approvals').select(['id','targets','created_at']).where('operation_id','=',id).orderBy('created_at').execute();
  const {payload,...details}=operation;
  return {as_of:actor.at.toISOString(),access:await managementFinish(trx,actor,clock),operation:{...details,action:String(payload.action)},items,recoveries,approvals};
 });
}
