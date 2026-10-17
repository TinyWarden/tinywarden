import {sql,type Kysely,type Transaction} from "kysely";
import {randomUUID} from "node:crypto";
import type {Database} from "../db/types";
import {fail,isPgError} from "../errors";
import {uuid,ms} from "../validation";
import {authorize,completeAuthorization} from "./session";
import {accessGate,requireAdmin,accessView} from "./scope";
import {advanceAccess,accountLogin,credentialValues,replaceCredential,type Clock} from "./operator";
import {ensureProfile,profileInput,emailRevision} from "./profile";
import {requireLocalFallback} from "./oidc-configuration";
import {hashPassword} from "./password";
import {audit} from "./audit";
export type Entity="users"|"groups";
export type Choice="hosts"|"users"|"groups";
function revision(value:unknown){if(typeof value!=="string"||! /^[1-9][0-9]{0,15}$/.test(value)||!Number.isSafeInteger(Number(value)))fail("invalid_request",400);return value;}
function groupName(value:unknown){if(typeof value!=="string")fail("invalid_request",400);const s=value.trim();if(!s||[...s].length>64||/[\p{Cc}\p{Cf}\uD800-\uDFFF]/u.test(s))fail("invalid_request",400);return s;}
function role(value:unknown){if(value!=="admin"&&value!=="user")fail("invalid_request",400);return value;}
function ids(value:unknown){if(!Array.isArray(value)||value.length>256)fail("invalid_request",400);const v=value.map(uuid);if(new Set(v).size!==v.length)fail("invalid_request",400);return v;}
function deltas(raw:Record<string,unknown>,key:string){const add=ids(raw['add_'+key]),remove=ids(raw['remove_'+key]);if(add.some(v=>remove.includes(v)))fail("invalid_request",400);return {add,remove};}
async function adminSnapshot(db:Kysely<Database>,cookie:string,clock:Clock){return db.transaction().execute(async trx=>{const actor=await authorize(trx,cookie,clock);requireAdmin(actor);await completeAuthorization(trx,actor,clock());return actor;});}
export function accessOptions(search:string){const p=new URLSearchParams(search);if([...p.keys()].some(k=>!['page','search'].includes(k))||[...p.keys()].length!==new Set(p.keys()).size)fail("invalid_request",400);const page=p.get('page')??'1',query=p.get('search')??'';if(!/^[1-9][0-9]{0,3}$/.test(page)||+page>2000||[...query].length>100)fail("invalid_request",400);return {page:+page,search:query};}
export async function readAccess(db:Kysely<Database>,cookie:string,entity:Entity,options:{page:number;search:string},clock:Clock,id?:string){
 if(id)uuid(id);return db.transaction().execute(async trx=>{const actor=await authorize(trx,cookie,clock);requireAdmin(actor);const table=entity==='users'?'operators':'access_groups',label=entity==='users'?'login':'name';
 const match=entity==='users'?sql`(strpos(lower(login),lower(${options.search}))>0 OR EXISTS(SELECT 1 FROM tinywarden.operator_profiles p WHERE p.operator_id=id AND (strpos(lower(p.display_name),lower(${options.search}))>0 OR strpos(lower(p.email),lower(${options.search}))>0)))`:sql`strpos(lower(${sql.ref(label)}),lower(${options.search}))>0`;
 const where=sql<boolean>`${match} ${id?sql`AND id=${id}::uuid`:sql``}`;
 const total=Number((await sql<{n:string}>`SELECT count(*)::text n FROM tinywarden.${sql.id(table)} WHERE ${where}`.execute(trx)).rows[0]!.n);
 const rows=entity==='users'?(await sql<{id:string;login:string;role:"admin"|"user";disabled:boolean;groups:number;servers:number;display_name:string;email:string|null;email_verified:boolean;local_password:boolean;providers:string[];provider_groups:string[];profile_revision:string}>`SELECT id,login,role,disabled_at IS NOT NULL disabled,
   COALESCE((SELECT display_name FROM tinywarden.operator_profiles p WHERE p.operator_id=o.id),'') display_name,
   COALESCE((SELECT revision::text FROM tinywarden.operator_profiles p WHERE p.operator_id=o.id),'1') profile_revision,
   (SELECT email FROM tinywarden.operator_profiles p WHERE p.operator_id=o.id) email,
   COALESCE((SELECT email_verified_at IS NOT NULL FROM tinywarden.operator_profiles p WHERE p.operator_id=o.id),false) email_verified,
   EXISTS(SELECT 1 FROM tinywarden.operator_local_credentials c WHERE c.operator_id=o.id) local_password,
   COALESCE((SELECT jsonb_agg(p.label) FROM tinywarden.operator_external_identities i JOIN tinywarden.oidc_providers p ON p.id=i.provider_id WHERE i.operator_id=o.id),'[]'::jsonb) providers,
   COALESCE((SELECT jsonb_agg(g.name) FROM tinywarden.access_external_memberships m JOIN tinywarden.access_groups g ON g.id=m.group_id JOIN tinywarden.oidc_providers p ON p.id=m.provider_id WHERE m.operator_id=o.id AND p.enabled AND m.valid_until>CURRENT_TIMESTAMP),'[]'::jsonb) provider_groups,
   (SELECT count(*)::int FROM tinywarden.access_effective_group_members m WHERE m.operator_id=o.id) groups,
   (SELECT count(*)::int FROM tinywarden.access_user_hosts g WHERE g.operator_id=o.id) servers
   FROM tinywarden.operators o WHERE ${where} ORDER BY lower(login),id LIMIT 50 OFFSET ${(options.page-1)*50}`.execute(trx)).rows:
 (await sql<{id:string;name:string;users:number;servers:number}>`SELECT id,name,
   (SELECT count(*)::int FROM tinywarden.access_effective_group_members m WHERE m.group_id=g.id) users,
   (SELECT count(*)::int FROM tinywarden.access_group_hosts h WHERE h.group_id=g.id) servers
   FROM tinywarden.access_groups g WHERE ${where} ORDER BY lower(name),id LIMIT 50 OFFSET ${(options.page-1)*50}`.execute(trx)).rows;
 if(id&&!rows.length)fail("not_found",404);await completeAuthorization(trx,actor,clock());return {access:accessView(actor),revision:actor.accessRevision,total,page:options.page,page_size:50,items:rows};});
}
export async function readChoices(db:Kysely<Database>,cookie:string,entity:Entity,target:string,kind:Choice,options:{page:number;search:string},clock:Clock){
 uuid(target);if(entity==='users'&&kind==='users'||entity==='groups'&&kind==='groups')fail("invalid_request",400);
 return db.transaction().execute(async trx=>{const actor=await authorize(trx,cookie,clock);requireAdmin(actor);
 const parent=entity==='users'?'operators':'access_groups';if(!(await sql`SELECT id FROM tinywarden.${sql.id(parent)} WHERE id=${target}::uuid`.execute(trx)).rows.length)fail("not_found",404);
 const table=kind==='hosts'?'hosts':kind==='users'?'operators':'access_groups',label=kind==='hosts'?'label':kind==='users'?'login':'name';
 const condition=sql`strpos(lower(${sql.ref('c.'+label)}),lower(${options.search}))>0`;
 const selected=kind==='hosts'?entity==='users'?sql`EXISTS(SELECT 1 FROM tinywarden.access_user_hosts a WHERE a.operator_id=${target}::uuid AND a.host_id=c.id)`:
 sql`EXISTS(SELECT 1 FROM tinywarden.access_group_hosts a WHERE a.group_id=${target}::uuid AND a.host_id=c.id)`:
 kind==='groups'?sql`EXISTS(SELECT 1 FROM tinywarden.access_group_members a WHERE a.operator_id=${target}::uuid AND a.group_id=c.id)`:
 sql`EXISTS(SELECT 1 FROM tinywarden.access_group_members a WHERE a.group_id=${target}::uuid AND a.operator_id=c.id)`;
 const inherited=entity==='users'&&kind==='groups'?sql`COALESCE((SELECT jsonb_agg(p.label) FROM tinywarden.access_external_memberships m JOIN tinywarden.oidc_providers p ON p.id=m.provider_id WHERE m.operator_id=${target}::uuid AND m.group_id=c.id AND p.enabled AND m.valid_until>CURRENT_TIMESTAMP),'[]'::jsonb)`:entity==='groups'&&kind==='users'?sql`COALESCE((SELECT jsonb_agg(p.label) FROM tinywarden.access_external_memberships m JOIN tinywarden.oidc_providers p ON p.id=m.provider_id WHERE m.group_id=${target}::uuid AND m.operator_id=c.id AND p.enabled AND m.valid_until>CURRENT_TIMESTAMP),'[]'::jsonb)`:entity==='users'&&kind==='hosts'?sql`COALESCE((SELECT jsonb_agg(name) FROM (SELECT g.name FROM tinywarden.access_effective_group_members m
 JOIN tinywarden.access_group_hosts h ON h.group_id=m.group_id JOIN tinywarden.access_groups g ON g.id=m.group_id WHERE m.operator_id=${target}::uuid AND h.host_id=c.id ORDER BY lower(g.name) LIMIT 32) sources),'[]'::jsonb)`:sql`'[]'::jsonb`;
 const items=(await sql<{id:string;label:string;selected:boolean;inherited:string[]}>`SELECT c.id,${sql.ref('c.'+label)} label,${selected} selected,${inherited} inherited
 FROM tinywarden.${sql.id(table)} c WHERE ${condition} ORDER BY lower(${sql.ref('c.'+label)}),c.id LIMIT 50 OFFSET ${(options.page-1)*50}`.execute(trx)).rows;
 const total=Number((await sql<{n:string}>`SELECT count(*)::text n FROM tinywarden.${sql.id(table)} c WHERE ${condition}`.execute(trx)).rows[0]!.n);
 await completeAuthorization(trx,actor,clock());return {access:accessView(actor),revision:actor.accessRevision,items,total,page:options.page,page_size:50};});
}
async function references(trx:Transaction<Database>,table:'hosts'|'operators'|'access_groups',values:string[]){if(values.length&&(await trx.selectFrom(table).select('id').where('id','in',values).execute()).length!==values.length)fail('not_found',404);}
async function hostDelta(trx:Transaction<Database>,entity:Entity,target:string,d:{add:string[];remove:string[]}){await references(trx,'hosts',d.add);
 if(entity==='users'){if(d.remove.length)await trx.deleteFrom('access_user_hosts').where('operator_id','=',target).where('host_id','in',d.remove).execute();if(d.add.length)await trx.insertInto('access_user_hosts').values(d.add.map(host_id=>({operator_id:target,host_id}))).onConflict(c=>c.columns(['operator_id','host_id']).doNothing()).execute();}
 else{if(d.remove.length)await trx.deleteFrom('access_group_hosts').where('group_id','=',target).where('host_id','in',d.remove).execute();if(d.add.length)await trx.insertInto('access_group_hosts').values(d.add.map(host_id=>({group_id:target,host_id}))).onConflict(c=>c.columns(['group_id','host_id']).doNothing()).execute();}}
async function memberDelta(trx:Transaction<Database>,entity:Entity,target:string,d:{add:string[];remove:string[]}){await references(trx,entity==='users'?'access_groups':'operators',d.add);
 const column=entity==='users'?'operator_id':'group_id',other=entity==='users'?'group_id':'operator_id';
 if(d.remove.length)await trx.deleteFrom('access_group_members').where(column,'=',target).where(other,'in',d.remove).execute();
 if(d.add.length)await trx.insertInto('access_group_members').values(d.add.map(id=>entity==='users'?{operator_id:target,group_id:id}:{group_id:target,operator_id:id})).onConflict(c=>c.columns(['group_id','operator_id']).doNothing()).execute();}
export async function mutateAccess(db:Kysely<Database>,cookie:string,entity:Entity,id:string,action:'create'|'save'|'delete'|'password',raw:Record<string,unknown>,clock:Clock,correlationId:string=randomUUID()){
 uuid(id);const expected=revision(raw.expected_revision);let hashed:{salt:Buffer;hash:Buffer}|undefined;
 if(entity==='users'&&(action==='create'||action==='password')){await adminSnapshot(db,cookie,clock);hashed=await hashPassword(raw.password);}
 const loginName=entity==='users'&&action==='create'?accountLogin(raw.login):null;
 const name=entity==='groups'&&action!=='delete'?groupName(raw.name):null;
 const nextRole=entity==='users'&&action!=='password'?role(raw.role):null;
 if(entity==='users'&&action==='delete'||entity==='groups'&&action==='password')fail('invalid_request',400);
 if(action==='save'&&entity==='users'&&typeof raw.disabled!=='boolean')fail('invalid_request',400);
 const hosts=action==='save'?deltas(raw,'hosts'):{add:[],remove:[]},members=action==='save'?deltas(raw,entity==='users'?'groups':'members'):{add:[],remove:[]};
 try{return await db.transaction().execute(async trx=>{await accessGate(trx,true);const actor=await authorize(trx,cookie,clock);requireAdmin(actor);if(actor.accessRevision!==expected)fail('settings_conflict',409);const at=ms(clock());
 const op=entity==='users'?await trx.selectFrom('operators').selectAll().where('id','=',id).forUpdate().executeTakeFirst():undefined;
 const group=entity==='groups'?await trx.selectFrom('access_groups').selectAll().where('id','=',id).executeTakeFirst():undefined;
 if(action!=='create'&&!(op??group))fail('not_found',404);
 if(action==='create'){
  if(op??group)fail('account_exists',409);
  if(entity==='users'){await trx.insertInto('operators').values({id,login:loginName!,role:nextRole!,disabled_at:null,recovery_admin:false,auth_version:1,created_at:at}).execute();await trx.insertInto('operator_local_credentials').values({operator_id:id,...credentialValues(hashed!,at,true)}).execute();}
  else await trx.insertInto('access_groups').values({id,name:name!,created_at:at}).execute();
 }else if(action==='password'){if(id===actor.operatorId)fail('use_own_password',400);if(!await trx.selectFrom('operator_local_credentials').select('operator_id').where('operator_id','=',id).executeTakeFirst()&&raw.enable_local!==true)fail('local_login_disabled',409);await replaceCredential(trx,id,op!.auth_version,hashed!,at,true);
 }else if(action==='delete'){await trx.deleteFrom('access_groups').where('id','=',id).execute();
 }else{
  if(op){const disabled=raw.disabled as boolean;
   if(op.role==='admin'&&!op.disabled_at&&(nextRole!=='admin'||disabled)&&!await trx.selectFrom('operators').select('id').where('role','=','admin').where('disabled_at','is',null).where('id','!=',id).executeTakeFirst())fail('last_admin',409);
   if(id===actor.operatorId&&(nextRole!==op.role||disabled))fail('self_access_change',409);
   const changed=nextRole!==op.role||disabled!==!!op.disabled_at,nextVersion=Number(op.auth_version)+(changed?1:0);if(!Number.isSafeInteger(nextVersion))fail('version_exhausted',409);
   await trx.updateTable('operators').set({role:nextRole!,disabled_at:disabled?op.disabled_at??at:null,auth_version:nextVersion}).where('id','=',id).execute();if(changed)await trx.deleteFrom('operator_sessions').where('operator_id','=',id).execute();
  }else await trx.updateTable('access_groups').set({name:name!}).where('id','=',id).execute();
  if(op&&await trx.selectFrom('oidc_providers').select('id').where('enabled','=',true).executeTakeFirst())await requireLocalFallback(trx);
  await hostDelta(trx,entity,id,hosts);await memberDelta(trx,entity,id,members);
 }
 if(entity==='users'&&(action==='save'||action==='create')&&Object.hasOwn(raw,'display_name')){
  const values=profileInput(raw);await ensureProfile(trx,id);const oldProfile=await trx.selectFrom('operator_profiles').selectAll().where('operator_id','=',id).forUpdate().executeTakeFirstOrThrow();
  if(action==='save'&&raw.expected_profile_revision!==oldProfile.revision)fail('settings_conflict',409);
  const next=Number(oldProfile.revision)+1;if(!Number.isSafeInteger(next))fail('version_exhausted',409);
  await trx.updateTable('operator_profiles').set({...values,email_verified_at:oldProfile.email===values.email?oldProfile.email_verified_at:null,email_revision:emailRevision(oldProfile,values.email),revision:next}).where('operator_id','=',id).execute();
 }
 const finished=await completeAuthorization(trx,actor,clock()),resultRevision=await advanceAccess(trx);
 const changes:Record<string,unknown>=action==='save'?{...(entity==='users'?{role:nextRole,disabled:raw.disabled,add_groups:members.add,remove_groups:members.remove}:{name,add_members:members.add,remove_members:members.remove}),add_hosts:hosts.add,remove_hosts:hosts.remove}:action==='create'?(entity==='users'?{role:nextRole}:{name}):{};
 await audit(trx,{action:'access.changed',actorKind:'operator',operatorId:actor.operatorId,accessChange:{kind:entity+'_'+action,target_id:id,revision:resultRevision,changes},at:finished,correlationId});return {id,revision:resultRevision};});}
 catch(e){if(isPgError(e,'23505'))fail('name_exists',409);throw e;}
}
