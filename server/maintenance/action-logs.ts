import {type Kysely} from 'kysely';
import type {Database} from '../db/types';
import {accessGate} from '../access/scope';
import {collectionReadRoot,managementRoot,managementFinish} from '../fleet/management';
import {authorizeAgent} from '../fleet/agent-authority';
import {exactObject,sameDigest,uuid} from '../validation';
import {fail} from '../errors';
import {canonicalText,commandFingerprint} from '../skills/catalog/package-commands';
import {actionBinding,packageReason} from './action-values';
import {packageText,type PackageCatalog} from '../../lib/skills/package-types';
import {actionLogLimit,actionLogPhases,actionLogLevels,actionLogCodes,type ActionLogRecord,type ActionLogRow} from '../../lib/maintenance/action-log';

export function actionLogRecord(raw:unknown,catalog:PackageCatalog):ActionLogRecord{
 const hasMessage=!!raw&&typeof raw==='object'&&Object.hasOwn(raw,'message');
 const v=exactObject(raw,['sequence','phase','level',hasMessage?'message':'code']);
 if(!Number.isInteger(v.sequence)||Number(v.sequence)<1||Number(v.sequence)>actionLogLimit||
  !actionLogPhases.includes(v.phase as never)||!actionLogLevels.includes(v.level as never)||Buffer.byteLength(JSON.stringify(raw))>1023)fail('invalid_request',400);
 const common={sequence:Number(v.sequence),phase:v.phase as ActionLogRecord['phase'],level:v.level as ActionLogRecord['level']};
 if(hasMessage){const message=packageReason(v.message,catalog);if(Buffer.byteLength(packageText(catalog,message))>4096)fail('invalid_request',400);return {...common,message};}
 if(!actionLogCodes.includes(v.code as never))fail('invalid_request',400);
 return {...common,code:v.code as typeof actionLogCodes[number]};
}

/** Independent diagnostic lane: no job transitions, start grants or contact writes. */
export async function appendActionLogs(db:Kysely<Database>,credential:string,raw:unknown,clock:()=>Date){
 const v=exactObject(raw,['schema_version','job_id','scope','binding','entries']),scope=exactObject(v.scope,['host_id','agent_id','generation']);
 if(v.schema_version!==1||!Array.isArray(v.entries)||!v.entries.length||v.entries.length>actionLogLimit||!Number.isSafeInteger(scope.generation))fail('invalid_request',400);
 const id=uuid(v.job_id),host=uuid(scope.host_id),agent=uuid(scope.agent_id),binding=actionBinding(v.binding),entries=v.entries;
 return db.transaction().execute(async trx=>{
  await accessGate(trx);await collectionReadRoot(trx);
  const authority=await authorizeAgent(trx,credential,clock),at=authority.now;
  if(host!==authority.host.id||agent!==authority.agent.id||String(scope.generation)!==authority.agent.current_generation)fail('unauthorized',401);
  const job=await trx.selectFrom('maintenance_jobs').select(['id','host_id','agent_id','generation','action_binding','action_snapshot','delivered_at','completed_at'])
   .where('id','=',id).forUpdate().executeTakeFirst();
  if(!job||job.host_id!==host||job.agent_id!==agent||job.generation!==String(scope.generation)||!job.action_snapshot||!job.delivered_at||
   canonicalText(job.action_binding)!==canonicalText(binding))fail('maintenance_scope_changed',409);
  if(job.completed_at&&+at-+job.completed_at>86400000)fail('maintenance_expired',409);
  const records=entries.map(e=>actionLogRecord(e,job.action_snapshot!.catalog));
  if(new Set(records.map(r=>r.sequence)).size!==records.length)fail('invalid_request',400);
  for(const record of records){
   const fingerprint=commandFingerprint('action_log',record);
   const previous=await trx.selectFrom('maintenance_logs').select('fingerprint').where('job_id','=',id).where('sequence','=',record.sequence).executeTakeFirst();
   if(previous){if(!sameDigest(previous.fingerprint,fingerprint))fail('idempotency_conflict',409);continue;}
   await trx.insertInto('maintenance_logs').values({job_id:id,sequence:record.sequence,record,fingerprint,received_at:at}).execute();
  }
  return {schema_version:1,accepted:records.map(r=>r.sequence)};
 });
}

/** Only explicitly projected, catalogue-rendered data reaches the operator/clipboard. */
export async function readActionLogs(db:Kysely<Database>,cookie:string,operation:string,id:string,search:string,clock:()=>Date){
 operation=uuid(operation);id=uuid(id);const q=new URLSearchParams(search),requested=q.has('page')?Number(q.get('page')):null,pageSize=25,copy=q.get('copy')==='1';
 if([...q.keys()].some(k=>!['page','copy'].includes(k)||q.getAll(k).length!==1)||q.has('copy')&&!copy||copy&&requested!==null||requested!==null&&(!Number.isSafeInteger(requested)||requested<1||requested>20))fail('invalid_request',400);
 return db.transaction().execute(async trx=>{
  const actor=await managementRoot(trx,cookie,clock,false);
  const job=await trx.selectFrom('maintenance_jobs as j').innerJoin('hosts as h','h.id','j.host_id')
   .select(['j.id','j.phase','j.created_at','j.delivered_at','j.completed_at','j.attention','j.recovery_pending','j.process_running','j.action_snapshot','h.label'])
   .where('j.id','=',id).where('j.operation_id','=',operation).executeTakeFirst();
  if(!job)fail('not_found',404);
  const logs=await trx.selectFrom('maintenance_logs').select(['sequence','record','received_at']).where('job_id','=',id).orderBy('sequence').limit(actionLogLimit).execute();
  const events=await trx.selectFrom('maintenance_events').select(['sequence','phase','received_at']).where('job_id','=',id).orderBy('sequence').limit(256).execute();
  const rows:ActionLogRow[]=[{id:'requested',at:job.created_at.toISOString(),level:'info',phase:'queued',stage:'requested',message:null,code:null}];
  if(job.delivered_at)rows.push({id:'received',at:job.delivered_at.toISOString(),level:'info',phase:'preparing',stage:'received',message:null,code:null});
  let previous='preparing';
  for(const event of events){if(event.phase===previous)continue;previous=event.phase;rows.push({id:'stage-'+event.sequence,at:event.received_at.toISOString(),
   level:['failed','blocked','expired'].includes(event.phase)?'error':'info',phase:event.phase,stage:event.phase,message:null,code:null});}
  for(const entry of logs){const r=entry.record;rows.push({id:'log-'+entry.sequence,at:entry.received_at.toISOString(),level:r.level,phase:r.phase,stage:null,
   message:r.message&&job.action_snapshot?packageText(job.action_snapshot.catalog,r.message):null,code:r.code??null});}
  rows.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  const total=rows.length,page=requested??Math.max(1,Math.ceil(total/pageSize)),start=(page-1)*pageSize;
  if(page>Math.max(1,Math.ceil(total/pageSize)))fail('invalid_request',400);
  return {schema_version:1,as_of:actor.at.toISOString(),access:await managementFinish(trx,actor,clock),operation_id:operation,job_id:id,server:job.label,
   detailed:logs.length>0,total,page,page_size:pageSize,rows:copy?rows:rows.slice(start,start+pageSize),
   settled:!!job.completed_at&&!job.attention&&!job.recovery_pending&&!job.process_running};
 });
}
