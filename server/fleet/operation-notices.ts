import type {Kysely} from 'kysely';
import type {Database} from '../db/types';
import {authorize,completeAuthorization} from '../access/session';
import {requireAdmin,accessView} from '../access/scope';
import {exactObject,uuid} from '../validation';
import {fail} from '../errors';
import {dismissibleOperationNotice} from '../../lib/maintenance/operation-summary';

/** Idempotent account preference, separate from result acknowledgement and all job controls. */
export async function dismissOperationNotice(db:Kysely<Database>,cookie:string,raw:unknown,clock:()=>Date){
 const value=exactObject(raw,['job_id','expected_updated_at']),id=uuid(value.job_id);
 if(typeof value.expected_updated_at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value.expected_updated_at)||!Number.isFinite(Date.parse(value.expected_updated_at)))fail('invalid_request',400);
 const expected=Date.parse(value.expected_updated_at);
 return db.transaction().execute(async trx=>{
  const actor=await authorize(trx,cookie,clock);requireAdmin(actor);
  const job=await trx.selectFrom('maintenance_jobs').select(['id','phase','attention','recovery_pending','updated_at']).where('id','=',id).forShare().executeTakeFirst();
  if(!job)fail('not_found',404);
  if(+job.updated_at!==expected||!dismissibleOperationNotice(job))fail('operation_notice_changed',409);
  await trx.insertInto('operation_notice_dismissals').values({operator_id:actor.operatorId,job_id:id,job_updated_at:job.updated_at,dismissed_at:actor.at})
   .onConflict(c=>c.columns(['operator_id','job_id']).doUpdateSet({job_updated_at:job.updated_at,dismissed_at:actor.at})).execute();
  await completeAuthorization(trx,actor,clock());
  return {access:accessView(actor),job_id:id,dismissed:true};
 });
}
