import type {Transaction} from 'kysely';
import type {Database} from '../db/types';
import {terminalPhases} from '../../lib/maintenance/policy';
import {fail} from '../errors';

/** Caller holds the host lock; expiry never unlocks an uncertain native transaction. */
export async function activeMaintenance(trx:Transaction<Database>,host:string){
 return trx.selectFrom('maintenance_jobs').select(['id','phase','attention','apply_attempt','cancel_requested','recovery_pending'])
  .where('host_id','=',host).where(eb=>eb.or([eb('attention','=',true),eb('recovery_pending','=',true),eb('phase','not in',terminalPhases)]))
  .executeTakeFirst();
}
export async function assertMaintenanceIdle(trx:Transaction<Database>,host:string){
 if(await activeMaintenance(trx,host))fail('maintenance_busy',409);
}
export async function assertLifecycleSafe(trx:Transaction<Database>,host:string){
 const job=await activeMaintenance(trx,host);
 if(job&&(job.attention||job.apply_attempt||job.phase==='applying'||job.phase==='verifying'))fail('maintenance_reconciliation_required',409);
 // Even pre-apply cancellation requires the worker's safe checkpoint acknowledgement.
 if(job)fail('maintenance_cancel_required',409);
}
