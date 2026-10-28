import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import type {Kysely} from 'kysely';
import type {Database} from '../db/types';
import {accessGate} from '../access/scope';
import {collectionReadRoot} from '../fleet/management';
import {authorizeAgent} from '../fleet/agent-authority';
import {versioned} from '../validation';
import {fail} from '../errors';

const waiting=new WeakMap<Kysely<Database>,Set<string>>();
/** A wake-up hint only: no job, command, start grant, heartbeat or lock is retained. */
export async function waitForAgentWork(db:Kysely<Database>,credential:string,raw:unknown,clock:()=>Date,signal:AbortSignal){
 const input=versioned(raw,['wait_seconds','cursor']);
 if(!Number.isSafeInteger(input.wait_seconds)||Number(input.wait_seconds)<0||Number(input.wait_seconds)>25)fail('invalid_request',400);
 if(input.cursor!==null&&(typeof input.cursor!=='string'||!/^([a-f0-9]{64})$/.test(input.cursor)))fail('invalid_request',400);
 const authority=()=>db.transaction().execute(async trx=>{
  await accessGate(trx);await collectionReadRoot(trx);return authorizeAgent(trx,credential,clock);
 });
 const first=await authority(),key=first.agent.id;
 const active=waiting.get(db)??new Set<string>();waiting.set(db,active);
 if(active.has(key)||active.size>=256)fail('temporarily_unavailable',503);
 active.add(key);
 try{
  // performance.now is monotonic; changing a system clock cannot extend this wait.
  const deadline=performance.now()+Number(input.wait_seconds)*1000;
  let available=false,cursor='',baseline=typeof input.cursor==='string'?input.cursor:null;
  do{
   signal.throwIfAborted();
   const jobs=await db.selectFrom('maintenance_jobs').select(['id','phase','revision','cancel_requested','recovery_pending'])
    .where('host_id','=',first.host.id).where('agent_id','=',first.agent.id).where('generation','=',first.agent.current_generation)
    .where('action_binding','is not',null).where(eb=>eb.or([eb('completed_at','is',null),eb('attention','=',true),eb('recovery_pending','=',true)]))
    .orderBy('id').limit(100).execute();
   cursor=createHash('sha256').update(JSON.stringify(jobs)).digest('hex');
   available=baseline===null?jobs.length>0:cursor!==baseline;
   baseline??=cursor;
   if(available||performance.now()>=deadline)break;
   await delay(Math.min(1000,Math.max(0,deadline-performance.now())),undefined,{signal});
  }while(performance.now()<deadline);
  // Revocation/replacement while waiting never returns an authorized work hint.
  const current=await authority();
  if(current.agent.id!==first.agent.id||current.agent.current_generation!==first.agent.current_generation)fail('unauthorized',401);
  return {schema_version:1,available,cursor};
 }finally{active.delete(key);}
}
