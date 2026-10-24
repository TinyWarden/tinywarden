import {sql,type Kysely,type Transaction} from 'kysely';
import type {Database} from '../db/types';
import {guardRetentionPass} from '../data/retention-policy';
import {collectionReadRoot} from '../fleet/management';
import {activeMaintenance} from './fencing';

export const maintenancePurgeTables=['maintenance_jobs','maintenance_plans','maintenance_approvals','maintenance_events','maintenance_plan_parts','maintenance_verification_runs','maintenance_recoveries'] as const;
export function maintenanceExpiry(cutoff:Date){return sql<boolean>`j.completed_at<${cutoff} AND NOT j.attention AND NOT j.process_running AND NOT j.recovery_pending`;}
export async function previewMaintenanceExpiry(trx:Transaction<Database>,cutoff:Date){
 const count=(await sql<{count:string}>`SELECT count(*)::text count FROM tinywarden.maintenance_jobs j WHERE ${maintenanceExpiry(cutoff)}`.execute(trx)).rows[0]!;
 return Number(count.count);
}
/** Every caller follows retention/package/host order; active uncertainty never ages out. */
export async function pruneMaintenanceBatch(db:Kysely<Database>,cutoff:Date,revision?:string){
 return db.transaction().execute(async trx=>{
  await guardRetentionPass(trx,revision);await sql`SET LOCAL statement_timeout='5s'`.execute(trx);await sql`SET LOCAL lock_timeout='250ms'`.execute(trx);await collectionReadRoot(trx);
  const refs=await trx.selectFrom('maintenance_jobs as j').select(['j.id','j.host_id']).where(maintenanceExpiry(cutoff)).orderBy('j.completed_at').orderBy('j.id').limit(10).execute();
  if(!refs.length)return 0;
  await trx.selectFrom('hosts').select('id').where('id','in',refs.map(j=>j.host_id)).orderBy('id').forUpdate().execute();
  const ids=refs.map(j=>j.id);
  const rows=await trx.deleteFrom('maintenance_jobs as j').where('j.id','in',ids).where(maintenanceExpiry(cutoff)).executeTakeFirst();
  await sql`DELETE FROM tinywarden.maintenance_approvals WHERE id IN(SELECT a.id FROM tinywarden.maintenance_approvals a WHERE a.created_at<${cutoff}
   AND NOT EXISTS(SELECT 1 FROM tinywarden.maintenance_jobs j WHERE j.approval_id=a.id) ORDER BY a.created_at,a.id LIMIT 100 FOR UPDATE)`.execute(trx);
  return Number(rows.numDeletedRows);
 });
}
/** Run inside the EXISTING operation-receipts stage: durable stage indices stay stable. */
export async function purgeMaintenanceHost(trx:Transaction<Database>,host:string){
 if(await activeMaintenance(trx,host))throw new Error('purge_maintenance_active');
 const job=await trx.selectFrom('maintenance_jobs').select(['id','operation_id']).where('host_id','=',host).orderBy('id').limit(1).forUpdate().executeTakeFirst();
 if(!job)return 0;
 await trx.deleteFrom('maintenance_jobs').where('id','=',job.id).execute();
 // Multi-host receipts retain opaque ordered IDs while another job still references them.
 await sql`DELETE FROM tinywarden.maintenance_approvals a WHERE a.operation_id=${job.operation_id}::uuid
  AND NOT EXISTS(SELECT 1 FROM tinywarden.maintenance_jobs j WHERE j.approval_id=a.id)`.execute(trx);
 return 1;
}
