import {randomUUID} from 'node:crypto';
import type {Kysely,Transaction} from 'kysely';
import type {Database} from '../db/types';
import {fail} from '../errors';
import {uuid} from '../validation';
import {authorize,completeAuthorization} from './session';
import {accessGate,requireAdmin} from './scope';
import {advanceAccess,type Clock} from './operator';
import {audit} from './audit';
export function oidcUrl(raw:unknown){
 if(typeof raw!=='string'||raw.length>2048)fail('invalid_request',400);
 let u:URL;try{u=new URL(raw);}catch{fail('invalid_request',400);}
 if(u.protocol!=='https:'||!u.hostname||u.username||u.password||u.search||u.hash||u.href!==raw)fail('invalid_request',400);
 return u;
}
function text(raw:unknown,max:number){if(typeof raw!=='string'||!raw.trim()||[...raw].length>max||/[\p{Cc}\p{Cf}\uD800-\uDFFF]/u.test(raw))fail('invalid_request',400);return raw.trim();}
export async function requireLocalFallback(trx:Transaction<Database>){
 if(!await trx.selectFrom('operators as o').innerJoin('operator_local_credentials as c','c.operator_id','o.id').select('o.id').where('o.role','=','admin').where('o.disabled_at','is',null).where('c.must_change_password','=',false).executeTakeFirst())fail('local_admin_required',409);
}
export async function readOidcSettings(db:Kysely<Database>,cookie:string,clock:Clock,origin:string,secret?:string){return db.transaction().execute(async trx=>{
 const actor=await authorize(trx,cookie,clock);requireAdmin(actor);
 const provider=await trx.selectFrom('oidc_providers').selectAll().executeTakeFirst();
 const mappings=provider?await trx.selectFrom('oidc_group_mappings').select(['external_group','group_id']).where('provider_id','=',provider.id).orderBy('external_group').execute():[];
 const groups=await trx.selectFrom('access_groups').select(['id','name']).orderBy('name').limit(1000).execute();
 const linked=provider?Number((await trx.selectFrom('operator_external_identities').select(eb=>eb.fn.countAll<string>().as('n')).where('provider_id','=',provider.id).executeTakeFirstOrThrow()).n):0;
 await completeAuthorization(trx,actor,clock());return {revision:actor.accessRevision,provider:provider?{id:provider.id,label:provider.label,issuer:provider.issuer,client_id:provider.client_id,enabled:provider.enabled,groups_claim:provider.groups_claim,revision:provider.revision}:null,mappings,groups,linked,secret_configured:!!secret,callback_url:origin+'/api/v1/operator/oidc/callback'};
});}
export async function saveOidcSettings(db:Kysely<Database>,cookie:string,raw:Record<string,unknown>,clock:Clock,secret:string|undefined,correlationId:string){
 const issuer=oidcUrl(raw.issuer).href,label=text(raw.label,64),client_id=text(raw.client_id,256),groups_claim=text(raw.groups_claim,64);
 if(typeof raw.enabled!=='boolean'||typeof raw.expected_revision!=='string'||!Array.isArray(raw.mappings)||raw.mappings.length>128)fail('invalid_request',400);
 const mappings=raw.mappings.map(value=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='external_group,group_id')fail('invalid_request',400);const v=value as Record<string,unknown>;return {external_group:text(v.external_group,256),group_id:uuid(v.group_id)};});
 if(new Set(mappings.map(m=>m.external_group+'\0'+m.group_id)).size!==mappings.length)fail('invalid_request',400);
 if(raw.enabled&&!secret)fail('oidc_secret_required',409);
 return db.transaction().execute(async trx=>{await accessGate(trx,true);const actor=await authorize(trx,cookie,clock);requireAdmin(actor);if(actor.accessRevision!==raw.expected_revision)fail('settings_conflict',409);
 const old=await trx.selectFrom('oidc_providers').selectAll().executeTakeFirst();
 if(old&&(old.issuer!==issuer||old.client_id!==client_id)&&await trx.selectFrom('operator_external_identities').select('id').where('provider_id','=',old.id).executeTakeFirst())fail('oidc_identity_immutable',409);
 if(raw.enabled)await requireLocalFallback(trx);
 const groups=[...new Set(mappings.map(m=>m.group_id))];if(groups.length&&(await trx.selectFrom('access_groups').select('id').where('id','in',groups).execute()).length!==groups.length)fail('not_found',404);
 const id=old?.id??randomUUID(),revision=Number(old?.revision??0)+1;if(!Number.isSafeInteger(revision))fail('version_exhausted',409);
 const values={label,issuer,client_id,enabled:raw.enabled as boolean,auto_create:true,groups_claim,revision};
 await trx.insertInto('oidc_providers').values({id,...values}).onConflict(c=>c.column('id').doUpdateSet(values)).execute();
 // Configuration and mapping changes invalidate cached login attempts and all
 // provider-derived grants/sessions. Local memberships remain independent.
 const identities=await trx.selectFrom('operator_external_identities').select('id').where('provider_id','=',id).execute();
 if(identities.length)await trx.deleteFrom('operator_sessions').where('external_identity_id','in',identities.map(i=>i.id)).execute();
 if(raw.enabled)await trx.deleteFrom('operator_sessions').where('auth_method','=','local').where('operator_id','in',trx.selectFrom('operators').select('id').where('role','=','user')).execute();
 await trx.deleteFrom('oidc_transactions').where('provider_id','=',id).execute();
 await trx.deleteFrom('access_external_memberships').where('provider_id','=',id).execute();
 await trx.deleteFrom('oidc_group_mappings').where('provider_id','=',id).execute();
 if(mappings.length)await trx.insertInto('oidc_group_mappings').values(mappings.map(m=>({...m,provider_id:id}))).execute();
 const at=await completeAuthorization(trx,actor,clock()),access=await advanceAccess(trx);
 await audit(trx,{action:'access.changed',actorKind:'operator',operatorId:actor.operatorId,accessChange:{kind:'oidc_configuration',target_id:id,revision:access},at,correlationId});
 return {id,revision:access};
 });
}
