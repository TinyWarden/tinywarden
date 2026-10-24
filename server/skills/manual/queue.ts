import {randomUUID} from 'node:crypto';
import type {Transaction} from 'kysely';
import type {Database} from '../../db/types';
import {fail} from '../../errors';
import {currentScope,contextKey,expireRequests} from './lifecycle';

/** Caller holds the access/package gate and supplies an authorized immutable scope.
 * Internal verification may wait for an older operator request to settle rather
 * than treating its earlier observation as a fresh post-maintenance result. */
export async function enqueueManualRun(trx:Transaction<Database>,input:{
 host:string;installation:string;operator:string;expectedContext:string;at:Date;notBefore?:Date;
}){
 const {host,installation:id,operator,expectedContext,at,notBefore}=input;
 await expireRequests(trx,host,at);
 const current=await currentScope(trx,host,id,at);
 if(!current)fail('not_found',404);
 if(contextKey(current.scope)!==expectedContext)fail('scope_changed',409);
 if(current.unavailable)fail(current.unavailable,409);
 let row=await trx.selectFrom('skill_manual_runs').selectAll().where('host_id','=',host).where('installation_id','=',id)
  .where('phase','in',['queued','running']).executeTakeFirst();
 if(row&&notBefore&&row.requested_at<notBefore)return {row:null,scope:current.scope};
 if(!row){
  const count=await trx.selectFrom('skill_manual_runs').select(eb=>eb.fn.countAll<string>().as('count')).where('host_id','=',host)
   .where('phase','in',['queued','running']).executeTakeFirstOrThrow();
  if(Number(count.count)>=8){if(notBefore)return {row:null,scope:current.scope};fail('manual_queue_full',409);}
  row=await trx.insertInto('skill_manual_runs').values({...current.scope,id:randomUUID(),operator_id:operator,
   requested_at:at,queue_expires_at:new Date(+at+300000),phase:'queued',started_at:null,run_deadline:null,
   result_deadline:null,completed_at:null,reason:null,assignment_id:null,run_id:null,run_sequence:null}).returningAll().executeTakeFirstOrThrow();
 }
 return {row,scope:current.scope};
}
