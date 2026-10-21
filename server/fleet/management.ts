import { randomUUID } from 'node:crypto';
import { sql, type Kysely, type Transaction } from 'kysely';
import type { Database } from '../db/types';
import { accessGate, requireAdmin, accessView } from '../access/scope';
import { authorize, completeAuthorization, type SessionContext } from '../access/session';
import { commandFingerprint, nextCounter, packageLock } from '../skills/catalog/package-commands';
import { exactObject, uuid, sameDigest } from '../validation';
import { fail } from '../errors';
import { lockRetentionPolicy } from '../data/retention-policy';

export type FleetDb=Kysely<Database>;
export function boundedText(value:unknown,max:number,empty=true){
  if(typeof value!=='string'||[...value].length>max||!empty&&!value.trim()||/[\p{Cc}\p{Cf}\uD800-\uDFFF]/u.test(value.replace(/[\n\r\t]/g,'')))fail('invalid_request',400);
  return value.trim();
}
export function ids(value:unknown,limit=100){
  if(!Array.isArray(value)||value.length>limit)fail('invalid_request',400);
  const result=value.map(uuid).sort();if(new Set(result).size!==result.length)fail('invalid_request',400);return result;
}
export function tags(value:unknown){
  if(!Array.isArray(value)||value.length>20)fail('invalid_request',400);
  return [...new Set(value.map(v=>boundedText(v,64,false).toLowerCase()))].sort();
}
export function revision(value:unknown){
  if(typeof value!=='string'||! /^[1-9][0-9]{0,15}$/.test(value)||!Number.isSafeInteger(Number(value)))fail('invalid_request',400);return value;
}
export async function managementRoot(trx:Transaction<Database>,cookie:string,clock:()=>Date,collection=true){
  await accessGate(trx,true);const actor=await authorize(trx,cookie,clock);requireAdmin(actor);
  if(collection){await packageLock(trx);
    await sql`SELECT definition_key FROM tinywarden.check_definitions ORDER BY definition_key FOR UPDATE`.execute(trx);
    await sql`SELECT definition_key FROM tinywarden.baseline_definitions ORDER BY definition_key FOR UPDATE`.execute(trx);}
  return actor;
}
export async function fleetAudit(trx:Transaction<Database>,actor:string|null,host:string|null,action:string,at:Date,operation:string|null,facts:Record<string,unknown>={}){
  await trx.insertInto('fleet_audit').values({id:randomUUID(),operator_id:actor,host_id:host,action,occurred_at:at,operation_id:operation,facts}).execute();
}
export async function managementFinish(trx:Transaction<Database>,actor:SessionContext,clock:()=>Date){
  await completeAuthorization(trx,actor,clock());return accessView(actor);
}
export async function groupCommand(db:FleetDb,cookie:string,raw:Record<string,unknown>,clock:()=>Date){
  exactObject(raw,['request_id','action','id','expected_revision','name','description']);
  const request=uuid(raw.request_id),action=raw.action;
  if(!['create','save','delete'].includes(String(action)))fail('invalid_request',400);
  const id=action==='create'?request:uuid(raw.id),expected=action==='create'?null:revision(raw.expected_revision);
  const name=action==='delete'?'':boundedText(raw.name,64,false),description=action==='delete'?'':boundedText(raw.description,2000);
  const fp=commandFingerprint('fleet_group',action,id,expected,name,description);
  try{return await db.transaction().execute(async trx=>{
    const actor=await managementRoot(trx,cookie,clock,false);
    const old=await trx.selectFrom('fleet_operations').selectAll().where('id','=',request).executeTakeFirst();
    if(old){if(old.operator_id!==actor.operatorId||!sameDigest(old.fingerprint,fp))fail('idempotency_conflict',409);return {id:uuid(old.payload.id),revision:revision(old.payload.revision),access:await managementFinish(trx,actor,clock)};}
    const at=clock();let next='1';
    if(action==='create')await trx.insertInto('fleet_groups').values({id,name,description,created_at:at}).execute();
    else{
      const current=await trx.selectFrom('fleet_groups').selectAll().where('id','=',id).forUpdate().executeTakeFirst();
      if(!current)fail('not_found',404);if(current.revision!==expected)fail('settings_conflict',409);next=nextCounter(current.revision);
      if(action==='delete'){
        await trx.deleteFrom('fleet_group_hosts').where('group_id','=',id).execute();
        await trx.deleteFrom('fleet_groups').where('id','=',id).execute();
      }else await trx.updateTable('fleet_groups').set({name,description,revision:next}).where('id','=',id).execute();
    }
    const result={id,revision:next};await trx.insertInto('fleet_operations').values({id:request,operator_id:actor.operatorId,fingerprint:fp,kind:'group_'+action,payload:result,created_at:at}).execute();
    await fleetAudit(trx,actor.operatorId,null,'group_'+action,at,request,{group_id:id,revision:next});
    return {...result,access:await managementFinish(trx,actor,clock)};
  });}catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='23505')fail('name_exists',409);throw error;}
}
export async function validateGroups(trx:Transaction<Database>,groups:string[]){
  if(groups.length&&(await trx.selectFrom('fleet_groups').select('id').where('id','in',groups).forShare().execute()).length!==groups.length)fail('group_unavailable',409);
}
export async function setMemberships(trx:Transaction<Database>,host:string,groups:string[],labels:string[]){
  await validateGroups(trx,groups);
  await trx.deleteFrom('fleet_group_hosts').where('host_id','=',host).execute();
  if(groups.length)await trx.insertInto('fleet_group_hosts').values(groups.map(group_id=>({group_id,host_id:host}))).execute();
  await trx.deleteFrom('fleet_host_tags').where('host_id','=',host).execute();
  if(labels.length)await trx.insertInto('fleet_host_tags').values(labels.map(tag=>({tag,host_id:host}))).execute();
}

/** Sampling uses the same root order as lifecycle writes, before taking a host. */
export async function collectionReadRoot(trx:Transaction<Database>){
  await lockRetentionPolicy(trx);
  await packageLock(trx);
  await sql`SELECT definition_key FROM tinywarden.check_definitions ORDER BY definition_key FOR SHARE`.execute(trx);
  await sql`SELECT definition_key FROM tinywarden.baseline_definitions ORDER BY definition_key FOR SHARE`.execute(trx);
}
