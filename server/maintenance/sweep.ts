import type {Kysely} from 'kysely';
import type {Database} from '../db/types';
import {accessGate} from '../access/scope';
import {collectionReadRoot} from '../fleet/management';
import {advanceMaintenance} from './progress';

/** Bounded background classification. No command dispatch, invented stop proof,
 * start grants, fence release or approval is performed by elapsed time. */
export async function sweepMaintenance(db:Kysely<Database>,clock=()=>new Date()){
 return db.transaction().execute(async trx=>{
  await accessGate(trx);await collectionReadRoot(trx);const at=clock();
  const refs=await trx.selectFrom('maintenance_jobs').select(['id','host_id'])
   .where('completed_at','is',null).where(eb=>eb.or([eb('expires_at','<=',at),eb('plan_expires_at','<=',at),
    eb('phase','in',['applying','verifying']),eb.and([eb('phase','=','preparing'),eb('prepared_at','is not',null)])]))
   .orderBy('checked_at',ob=>ob.asc().nullsFirst()).orderBy('id').limit(10).execute();
  if(!refs.length)return 0;
  await trx.selectFrom('hosts').select('id').where('id','in',refs.map(r=>r.host_id)).orderBy('id').forUpdate().execute();
  const jobs=await trx.selectFrom('maintenance_jobs').selectAll().where('id','in',refs.map(r=>r.id)).orderBy('host_id').forUpdate().execute();
  for(const job of jobs){await advanceMaintenance(trx,job,at);
   await trx.updateTable('maintenance_jobs').set({checked_at:at}).where('id','=',job.id).execute();}
  return jobs.length;
 });
}
