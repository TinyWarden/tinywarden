import type {Transaction,Selectable} from 'kysely';
import type {Database} from '../db/types';
import type {MaintenanceTables} from '../db/maintenance-types';
import {fail} from '../errors';
import {maintenanceReadiness} from './readiness';
import {verificationSnapshot,localVerificationSnapshot,sameVerificationCoverage} from './verification';
import {currentBoundAction} from './package-actions';
import {effectiveSettings} from '../skills/settings/package-validation';
import {canonicalText} from '../skills/catalog/package-commands';
import {bytesDigest} from './action-values';
import type {VerificationSnapshot} from '../../lib/maintenance/contracts';
export type MaintenanceJobRow=Selectable<MaintenanceTables['maintenance_jobs']>;

/** Existing access/package gate precedes sorted host locks, then operation/jobs. */
export async function lockOperation(trx:Transaction<Database>,id:string){
 const ref=await trx.selectFrom('fleet_operations').select(['id','kind']).where('id','=',id).executeTakeFirst();
 if(!ref||ref.kind!=='maintenance_action')fail('not_found',404);
 const ids=await trx.selectFrom('fleet_operation_items').select('host_id').where('operation_id','=',id).execute();
 const hosts=await trx.selectFrom('hosts').selectAll().where('id','in',ids.map(r=>r.host_id)).orderBy('id').forUpdate().execute();
 const operation=await trx.selectFrom('fleet_operations').selectAll().where('id','=',id).forUpdate().executeTakeFirstOrThrow();
 const jobs=await trx.selectFrom('maintenance_jobs').selectAll().where('operation_id','=',id).orderBy('host_id').forUpdate().execute();
 return {operation,hosts,jobs};
}
export async function enabledAdministrator(trx:Transaction<Database>,id:string){
 const actor=await trx.selectFrom('operators').select(['role','disabled_at']).where('id','=',id).executeTakeFirst();
 if(!actor||actor.role!=='admin'||actor.disabled_at)fail('maintenance_authority_revoked',409);
}
/** Reading an authenticated terminal receipt remains possible after requester demotion. */
export async function preparationAuthority(trx:Transaction<Database>,job:MaintenanceJobRow,at:Date,fresh=true){
 if(!job.action_binding)fail('maintenance_legacy_recovery_required',409);
 const operation=await trx.selectFrom('fleet_operations').select('operator_id').where('id','=',job.operation_id).executeTakeFirstOrThrow();
 await enabledAdministrator(trx,operation.operator_id);
 const host=await trx.selectFrom('hosts').selectAll().where('id','=',job.host_id).executeTakeFirstOrThrow();
 const readiness=await maintenanceReadiness(trx,host,at,{ownJob:job.id,requireFresh:fresh});
 if(job.action_binding){
  const current=await currentBoundAction(trx,job.action_binding);
  if(current.enablement_version!==job.action_enablement_version||current.snapshot.descriptor.requires_monitoring&&host.monitoring_epoch!==job.action_monitoring_epoch)fail('maintenance_scope_changed',409);
  const policy=await trx.selectFrom('host_skill_policies').select('overrides').where('host_id','=',host.id).where('installation_id','=',current.installation_id).executeTakeFirst();
  if(bytesDigest(canonicalText(effectiveSettings(current.defaults,policy?.overrides??{})))!==job.action_binding.settings_sha256)fail('maintenance_scope_changed',409);
 }
 const action=readiness.actions.find(a=>job.action_binding?a.installation_id===job.action_binding.installation_id&&a.action_id===job.action:a.action_id===job.action);
 const reason=action?.reason??(!action?'maintenance_authority_revoked':null);
 if(reason)fail(reason,409);
 if(readiness.agent?.id!==job.agent_id||readiness.agent.current_generation!==job.generation)fail('maintenance_scope_changed',409);
 return host;
}
export async function assertVerificationCoverage(trx:Transaction<Database>,host:string,baseline:VerificationSnapshot,at:Date){
 const current=baseline.mode==='local'?await localVerificationSnapshot(trx,host,at):await verificationSnapshot(trx,host,at);
 if(!sameVerificationCoverage(baseline,current))fail('maintenance_scope_changed',409);
 return current;
}
