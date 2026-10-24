import type {Transaction,Selectable} from 'kysely';
import type {Database} from '../db/types';
import type {MaintenanceTables} from '../db/maintenance-types';
import {fail} from '../errors';
import {maintenanceReadiness} from './readiness';
import {verificationSnapshot,sameVerificationCoverage} from './verification';
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
 const operation=await trx.selectFrom('fleet_operations').select('operator_id').where('id','=',job.operation_id).executeTakeFirstOrThrow();
 await enabledAdministrator(trx,operation.operator_id);
 const host=await trx.selectFrom('hosts').selectAll().where('id','=',job.host_id).executeTakeFirstOrThrow();
 const readiness=await maintenanceReadiness(trx,host,at,{ownJob:job.id,requireFresh:fresh});
 const reason=readiness.actions.find(a=>a.id===job.action)?.reason;
 if(reason)fail(reason,409);
 if(readiness.agent?.id!==job.agent_id||readiness.agent.current_generation!==job.generation)fail('maintenance_scope_changed',409);
 return host;
}
export async function assertVerificationCoverage(trx:Transaction<Database>,host:string,baseline:VerificationSnapshot,at:Date){
 const current=await verificationSnapshot(trx,host,at);
 if(!sameVerificationCoverage(baseline,current))fail('maintenance_scope_changed',409);
 return current;
}
