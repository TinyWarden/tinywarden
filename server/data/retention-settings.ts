import { retentionPolicy, retentionCutoff } from './retention-policy';
import { authorize } from '../access/session';
import { accessView,requireAdmin } from '../access/scope';
import { advanceAccess } from '../access/operator';
import { recordResponseAuthority } from '../access/response-context';
import { managementRoot,managementFinish,fleetAudit,revision,type FleetDb } from '../fleet/management';
import { commandFingerprint,nextCounter } from '../skills/catalog/package-commands';
import { sameDigest,uuid,exactObject } from '../validation';
import { fail } from '../errors';
export function retentionDaysInput(value:unknown){if(typeof value!=='number'||!Number.isInteger(value)||value<1||value>3650)fail('invalid_request',400);return value;}
function confirmation(expected:string,days:number){return commandFingerprint('retention_change',expected,days).toString('hex');}
export async function readRetentionSettings(db:FleetDb,cookie:string,clock:()=>Date,previewDays?:number){
 return db.transaction().execute(async trx=>{
  const actor=await authorize(trx,cookie,clock);requireAdmin(actor);const p=await retentionPolicy(trx,actor.at);
  const days=previewDays===undefined?p.days:retentionDaysInput(previewDays);
  return {as_of:actor.at.toISOString(),access:await managementFinish(trx,actor,clock),days:p.days,revision:p.revision,cutoff:p.cutoff.toISOString(),
   preview:previewDays===undefined?null:{days,cutoff:retentionCutoff(actor.at,{...p,days}).toISOString(),confirmation:confirmation(p.revision,days)}};
 });
}
export async function saveRetentionSettings(db:FleetDb,cookie:string,raw:Record<string,unknown>,clock:()=>Date){
 exactObject(raw,['request_id','expected_revision','days','confirmation']);const request=uuid(raw.request_id),expected=revision(raw.expected_revision),days=retentionDaysInput(raw.days);
 if(raw.confirmation!==null&&(typeof raw.confirmation!=='string'||! /^[0-9a-f]{64}$/.test(raw.confirmation)))fail('invalid_request',400);
 const fp=commandFingerprint('retention_settings',expected,days,raw.confirmation);
 return db.transaction().execute(async trx=>{
  const actor=await managementRoot(trx,cookie,clock,false);
  const old=await trx.selectFrom('fleet_operations').selectAll().where('id','=',request).executeTakeFirst();
  if(old){if(old.operator_id!==actor.operatorId||!sameDigest(old.fingerprint,fp))fail('idempotency_conflict',409);return {days:retentionDaysInput(old.payload.days),revision:revision(old.payload.revision),cutoff:String(old.payload.cutoff),access:await managementFinish(trx,actor,clock)};}
  const p=await trx.selectFrom('data_retention_policy').selectAll().where('singleton','=',true).forUpdate().executeTakeFirstOrThrow();
  if(p.revision!==expected)fail('settings_conflict',409);
  if(days<p.days&&raw.confirmation!==confirmation(expected,days))fail('confirmation_required',409);
  const at=clock(),cutoff=retentionCutoff(at,{days,expired_before:retentionCutoff(at,p)}),next=days===p.days?p.revision:nextCounter(p.revision);
  await trx.updateTable('data_retention_policy').set({days,revision:next,expired_before:cutoff}).where('singleton','=',true).execute();
  const result={days,revision:next,cutoff:cutoff.toISOString()};
  await trx.insertInto('fleet_operations').values({id:request,operator_id:actor.operatorId,kind:'retention',fingerprint:fp,payload:result,created_at:at}).execute();
  await fleetAudit(trx,actor.operatorId,null,'retention',at,request,{days,previous_days:p.days,revision:next});
  if(days!==p.days)actor.accessRevision=await advanceAccess(trx);recordResponseAuthority(accessView(actor));
  return {...result,access:await managementFinish(trx,actor,clock)};
 });
}
