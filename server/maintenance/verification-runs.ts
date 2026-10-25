import type {Transaction} from 'kysely';
import type {Database} from '../db/types';
import {AppError} from '../errors';
import {enqueueManualRun} from '../skills/manual/queue';
import {currentScope,contextKey} from '../skills/manual/lifecycle';
import {currentVerificationPolicy,verificationSnapshot,sameVerificationCoverage} from './verification';
import type {VerificationSnapshot} from '../../lib/maintenance/contracts';
import {maintenanceLimits} from '../../lib/maintenance/policy';

export function verificationRegression(before:VerificationSnapshot,after:VerificationSnapshot){
 for(const baseline of before.members){
  const current=after.members.find(m=>m.installation_id===baseline.installation_id);
  if(!current||baseline.severity==='healthy'&&current.severity!=='healthy')return true;
  const key=(s:{collection:string;key:string})=>JSON.stringify([s.collection,s.key]);
  const old=new Map(baseline.subjects.map(s=>[key(s),s.status]));
  const present=new Map(current.subjects.map(s=>[key(s),s.status]));
  if(baseline.subjects.some(s=>!present.has(key(s))))return true;
  if(current.subjects.some(s=>s.status==='warning'&&old.get(key(s))!=='warning'))return true;
 }
 return false;
}
type Progress={state:'pending';reason:null}|{state:'failed';reason:string}|{state:'verified';reason:null;snapshot:VerificationSnapshot};
/** Every member is tied to a new normal Run now receipt after the phase boundary.
 * No package-name branch or synthetic browser session grants collection authority. */
export async function verificationProgress(trx:Transaction<Database>,input:{job:string;host:string;operator:string;
 baseline:VerificationSnapshot;stage:'baseline'|'post';notBefore:Date;at:Date}):Promise<Progress>{
 const {job,host,operator,baseline,stage,notBefore,at}=input;
 if(+at-+notBefore>=maintenanceLimits.verifySeconds*1000)return {state:'failed',reason:'maintenance_verification_timeout'};
 if(await currentVerificationPolicy(trx,host,at)!==baseline.policy_sha256)return {state:'failed',reason:'maintenance_scope_changed'};
 if(baseline.mode==='local')return {state:'verified',reason:null,snapshot:baseline};
 let pending=false;
 for(const member of baseline.members){
  const scope=await currentScope(trx,host,member.installation_id,at);
  if(!scope||!scope.valid||contextKey(scope.scope)!==member.scope_sha256)return {state:'failed',reason:'maintenance_scope_changed'};
  if(scope.unavailable){pending=true;continue;}
  let link=await trx.selectFrom('maintenance_verification_runs').selectAll().where('job_id','=',job).where('installation_id','=',member.installation_id).where('stage','=',stage).executeTakeFirst();
  if(!link){
   try{
    const queued=await enqueueManualRun(trx,{host,installation:member.installation_id,operator,expectedContext:member.scope_sha256,at,notBefore});
    if(!queued.row){pending=true;continue;}
    link=await trx.insertInto('maintenance_verification_runs').values({job_id:job,installation_id:member.installation_id,stage,manual_run_id:queued.row.id}).returningAll().executeTakeFirstOrThrow();
   }catch(error){
    if(error instanceof AppError&&['contact_unavailable','runtime_unavailable','agent_upgrade_required'].includes(error.code)){pending=true;continue;}
    throw error;
   }
  }
  if(!link.manual_run_id)return {state:'failed',reason:'maintenance_verification_missing'};
  const run=await trx.selectFrom('skill_manual_runs').selectAll().where('id','=',link.manual_run_id).executeTakeFirst();
  if(!run||run.phase==='failed'||run.requested_at<notBefore)return {state:'failed',reason:'maintenance_verification_failed'};
  if(run.phase!=='completed'){pending=true;continue;}
  const observed=run.run_id?await trx.selectFrom('skill_observations').select(['id','host_id','installation_id','received_at','current','outcome']).where('id','=',run.run_id).executeTakeFirst():null;
  if(!observed||observed.host_id!==host||observed.installation_id!==member.installation_id||observed.received_at<notBefore||!observed.current||observed.outcome!=='observed')return {state:'failed',reason:'maintenance_verification_missing'};
 }
 if(pending)return {state:'pending',reason:null};
 try{
  const snapshot=await verificationSnapshot(trx,host,at);
  // Current state may be newer than the requested receipt, but may never precede it.
  for(const member of snapshot.members){
   const observation=await trx.selectFrom('skill_observations').select('received_at').where('id','=',member.observation_id).executeTakeFirst();
   if(!observation||observation.received_at<notBefore)return {state:'pending',reason:null};
  }
  if(!sameVerificationCoverage(baseline,snapshot))return {state:'failed',reason:'maintenance_scope_changed'};
  if(stage==='post'&&verificationRegression(baseline,snapshot))return {state:'failed',reason:'maintenance_health_regression'};
  return {state:'verified',reason:null,snapshot};
 }catch(error){if(error instanceof AppError&&error.code==='maintenance_health_baseline')return {state:'failed',reason:'maintenance_health_regression'};throw error;}
}
