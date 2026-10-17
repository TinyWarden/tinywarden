import type {Kysely,Transaction} from "kysely";
import type {Database} from "../db/types";
import {accessGate} from "./scope";
import {advanceAccess} from "./operator";
import {mailbox} from "../email/config";
import {uuid} from "../validation";
import {fail} from "../errors";
import {authorize,completeAuthorization} from "./session";
import {audit} from "./audit";
import type {Clock} from "./operator";
export function profileInput(raw:Record<string,unknown>){
 if(typeof raw.display_name!=="string"||[...raw.display_name].length>100||/[\p{Cc}\p{Cf}\uD800-\uDFFF]/u.test(raw.display_name))fail("invalid_request",400);
 const name=raw.display_name.trim();let email:string|null=null;
 if(raw.email!==null){if(typeof raw.email!=="string")fail("invalid_request",400);email=raw.email.trim();
  try{mailbox(email);}catch{fail("invalid_request",400);}}
 return {display_name:name,email};
}
export async function ensureProfile(trx:Transaction<Database>,id:string){await trx.insertInto('operator_profiles').values({operator_id:id,display_name:'',email:null,email_verified_at:null,revision:1}).onConflict(c=>c.column('operator_id').doNothing()).execute();}
export async function readProfile(db:Kysely<Database>,cookie:string,clock:Clock){return db.transaction().execute(async trx=>{
 const actor=await authorize(trx,cookie,clock);await ensureProfile(trx,actor.operatorId);
 const profile=await trx.selectFrom('operator_profiles').selectAll().where('operator_id','=',actor.operatorId).executeTakeFirstOrThrow();
 const local=!!await trx.selectFrom('operator_local_credentials').select('operator_id').where('operator_id','=',actor.operatorId).executeTakeFirst();
 const identities=await trx.selectFrom('operator_external_identities as i').innerJoin('oidc_providers as p','p.id','i.provider_id').select(['i.id','p.label','p.enabled']).where('i.operator_id','=',actor.operatorId).execute();
 const groups=await trx.selectFrom('access_external_memberships as m').innerJoin('access_groups as g','g.id','m.group_id').innerJoin('oidc_providers as p','p.id','m.provider_id').select(['g.name','p.label','m.valid_until']).where('m.operator_id','=',actor.operatorId).where('p.enabled','=',true).where('m.valid_until','>',clock()).orderBy('g.name').execute();
 const provider=await trx.selectFrom('oidc_providers').select(['id','label']).where('enabled','=',true).executeTakeFirst();
 await completeAuthorization(trx,actor,clock());return {identities,provider:provider??null,provider_groups:groups,access_revision:actor.accessRevision,id:actor.operatorId,login:actor.login,role:actor.role,display_name:profile.display_name,email:profile.email,email_verified:!!profile.email_verified_at,revision:profile.revision,local_password:local};
});}
export async function saveProfile(db:Kysely<Database>,cookie:string,raw:Record<string,unknown>,clock:Clock,correlationId:string){
 const values=profileInput(raw);if(typeof raw.expected_revision!=='string')fail('invalid_request',400);
 return db.transaction().execute(async trx=>{const actor=await authorize(trx,cookie,clock);await ensureProfile(trx,actor.operatorId);
 const old=await trx.selectFrom('operator_profiles').selectAll().where('operator_id','=',actor.operatorId).forUpdate().executeTakeFirstOrThrow();
 if(old.revision!==raw.expected_revision)fail('settings_conflict',409);const next=Number(old.revision)+1;if(!Number.isSafeInteger(next))fail('version_exhausted',409);
 await trx.updateTable('operator_profiles').set({...values,email_verified_at:old.email===values.email?old.email_verified_at:null,email_revision:emailRevision(old,values.email),revision:next}).where('operator_id','=',actor.operatorId).execute();
 const at=await completeAuthorization(trx,actor,clock());await audit(trx,{action:'access.changed',actorKind:'operator',operatorId:actor.operatorId,accessChange:{kind:'profile_updated',target_id:actor.operatorId,revision:actor.accessRevision},at,correlationId});
 return {revision:String(next)};
 });
}

export async function unlinkIdentity(db:Kysely<Database>,cookie:string,raw:Record<string,unknown>,clock:Clock,correlationId:string){
 const id=uuid(raw.identity_id);return db.transaction().execute(async trx=>{
 await accessGate(trx,true);const actor=await authorize(trx,cookie,clock);if(raw.expected_revision!==actor.accessRevision)fail('settings_conflict',409);
 const identity=await trx.selectFrom('operator_external_identities').selectAll().where('id','=',id).where('operator_id','=',actor.operatorId).executeTakeFirst();if(!identity)fail('not_found',404);
 if(actor.role==='user'&&await trx.selectFrom('oidc_providers').select('id').where('enabled','=',true).executeTakeFirst())fail('local_password_required',409);
 if(!await trx.selectFrom('operator_local_credentials').select('operator_id').where('operator_id','=',actor.operatorId).where('must_change_password','=',false).executeTakeFirst())fail('local_password_required',409);
 const at=await completeAuthorization(trx,actor,clock());await trx.deleteFrom('access_external_memberships').where('operator_id','=',actor.operatorId).where('provider_id','=',identity.provider_id).execute();
 await trx.deleteFrom('operator_external_identities').where('id','=',id).execute();const revision=await advanceAccess(trx);
 await audit(trx,{action:'access.changed',actorKind:'operator',operatorId:actor.operatorId,accessChange:{kind:'oidc_unlinked',target_id:actor.operatorId,revision},at,correlationId});
 });
}

export function emailRevision(old:{email:string|null;email_revision:string},email:string|null){const next=Number(old.email_revision)+(old.email===email?0:1);if(!Number.isSafeInteger(next))fail('version_exhausted',409);return next;}
