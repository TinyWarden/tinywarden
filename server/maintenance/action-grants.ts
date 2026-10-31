import {randomUUID} from 'node:crypto';
import type {Kysely} from 'kysely';
import type {Database} from '../db/types';
import {authorize,completeAuthorization} from '../access/session';
import {accessGate,requireAdmin} from '../access/scope';
import {packageLock,commandFingerprint,nextCounter} from '../skills/catalog/package-commands';
import {exactObject,uuid,sameDigest} from '../validation';
import {fail} from '../errors';
import {installedActions} from './package-actions';

export async function readActionGrants(db:Kysely<Database>,cookie:string,id:string,clock:()=>Date){
 id=uuid(id);return db.transaction().execute(async trx=>{
  await accessGate(trx);await packageLock(trx);const actor=await authorize(trx,cookie,clock);requireAdmin(actor);
  const installation=await trx.selectFrom('skill_installations').select(['id','content_sha256']).where('id','=',id).executeTakeFirst();
  if(!installation)fail('not_found',404);
  const definitions=await installedActions(trx,id),grants=await trx.selectFrom('skill_action_grants').selectAll().where('installation_id','=',id).execute();
  const actions=definitions.map(a=>{const grant=grants.find(g=>g.content_sha256===a.content_sha256&&g.action_id===a.snapshot.descriptor.id);
   return {snapshot:a.snapshot,origin:a.origin,grant_id:grant?.id??null,revision:grant?.revision??'0',enabled:grant?.enabled??false};});
  return {as_of:actor.at.toISOString(),installation_id:id,content_sha256:installation.content_sha256,actions,access:await completeAuthorization(trx,actor,clock())};
 });
}

/** Exact digest, descriptor, origin and revision approval. Monitoring grants are untouched. */
export async function setActionGrant(db:Kysely<Database>,cookie:string,id:string,raw:unknown,clock:()=>Date){
 id=uuid(id);const v=exactObject(raw,['request_id','content_sha256','action_id','descriptor_sha256','expected_revision','enabled']);
 const request=uuid(v.request_id);
 if(typeof v.enabled!=='boolean'||typeof v.expected_revision!=='string'||!/^(0|[1-9][0-9]{0,15})$/.test(v.expected_revision)||!Number.isSafeInteger(Number(v.expected_revision)))fail('invalid_request',400);
 const enabled=v.enabled,expected=v.expected_revision;
 const fingerprint=commandFingerprint('skill_action_grant',id,v);
 return db.transaction().execute(async trx=>{
  await accessGate(trx);await packageLock(trx);const actor=await authorize(trx,cookie,clock);requireAdmin(actor);
  const prior=await trx.selectFrom('skill_action_mutations').selectAll().where('operator_id','=',actor.operatorId).where('request_id','=',request).executeTakeFirst();
  if(prior){if(!sameDigest(prior.fingerprint,fingerprint))fail('idempotency_conflict',409);await completeAuthorization(trx,actor,clock());return prior.result;}
  const installation=await trx.selectFrom('skill_installations').selectAll().where('id','=',id).forUpdate().executeTakeFirst();
  if(!installation||installation.content_sha256!==v.content_sha256)fail('settings_conflict',409);
  const definition=(await installedActions(trx,id)).find(a=>a.snapshot.descriptor.id===v.action_id&&a.snapshot.descriptor_sha256===v.descriptor_sha256);
  if(!definition)fail('maintenance_provider_unavailable',409);
  if(enabled&&definition.snapshot.descriptor.verification==='host_health')fail('maintenance_verification_retired',409);
  const priorGrant=await trx.selectFrom('skill_action_grants').selectAll().where('installation_id','=',id).where('content_sha256','=',installation.content_sha256).where('action_id','=',definition.snapshot.descriptor.id).forUpdate().executeTakeFirst();
  if((priorGrant?.revision??'0')!==expected)fail('settings_conflict',409);
  const revision=nextCounter(expected),grant=priorGrant?.id??randomUUID();
  const values={descriptor_sha256:definition.snapshot.descriptor_sha256,action_version:definition.snapshot.descriptor.version,
   origin:definition.origin,revision,enabled,operator_id:actor.operatorId,updated_at:actor.at};
  if(priorGrant)await trx.updateTable('skill_action_grants').set(values).where('id','=',grant).execute();
  else await trx.insertInto('skill_action_grants').values({...values,id:grant,installation_id:id,content_sha256:installation.content_sha256,action_id:definition.snapshot.descriptor.id,created_at:actor.at}).execute();
  const result={grant_id:grant,revision,enabled,content_sha256:installation.content_sha256};
  await completeAuthorization(trx,actor,clock());
  await trx.insertInto('skill_action_mutations').values({operator_id:actor.operatorId,request_id:request,fingerprint,result,completed_at:actor.at}).execute();return result;
 });
}
