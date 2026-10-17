import {createHash,randomBytes,randomUUID} from 'node:crypto';
import * as client from 'openid-client';
import type {Kysely} from 'kysely';
import type {Database} from '../db/types';
import {fail,isPgError} from '../errors';
import {ms,sameDigest} from '../validation';
import {authorize,completeAuthorization,issueSession} from './session';
import {accessGate} from './scope';
import {advanceAccess,reserveLoginAttempt,type Clock} from './operator';
import {ensureProfile,profileInput} from './profile';
import {audit} from './audit';
import {oidcConfiguration} from './oidc-client';
export const oidcCookie='__Host-tinywarden_oidc';
const token=()=>randomBytes(32).toString('base64url');
const digest=(v:string)=>createHash('sha256').update(v).digest();
const callback=(origin:string)=>origin+'/api/v1/operator/oidc/callback';
export async function publicOidc(db:Kysely<Database>,secret?:string){const p=await db.selectFrom('oidc_providers').select(['id','label']).where('enabled','=',true).executeTakeFirst();return secret&&p?p:null;}
export async function beginOidc(db:Kysely<Database>,origin:string,secret:string|undefined,intent:'login'|'link',cookie:string|undefined,clock:Clock,requestId:string,fetcher:typeof fetch=fetch){
 if(!secret)fail('oidc_unavailable',503);await reserveLoginAttempt(db,'oidc:'+intent,clock);
 const initial=await db.transaction().execute(async trx=>{
  await accessGate(trx);const p=await trx.selectFrom('oidc_providers').selectAll().where('enabled','=',true).executeTakeFirst();if(!p)fail('oidc_unavailable',503);
  const actor=intent==='link'?await authorize(trx,cookie??'',clock):null;
  if(actor){const s=await trx.selectFrom('operator_sessions').select('auth_method').where('id','=',actor.sessionId).executeTakeFirstOrThrow();
   // Linking requires recent local authentication. No existing provider session
   // can silently attach a different identity to a local account.
   if(s.auth_method!=='local'||actor.at.getTime()-actor.issuedAt.getTime()>15*60000)fail('oidc_recent_login_required',409);
   await completeAuthorization(trx,actor,clock());}
  return {provider:p,actor};
 });
 const config=await oidcConfiguration(initial.provider,secret,fetcher);
 const state=token(),browser=token(),nonce=client.randomNonce(),verifier=client.randomPKCECodeVerifier();
 const url=client.buildAuthorizationUrl(config,{redirect_uri:callback(origin),scope:'openid profile email',response_mode:'query',state,nonce,code_challenge:await client.calculatePKCECodeChallenge(verifier),code_challenge_method:'S256',...(intent==='link'?{prompt:'login'}:{})});
 await db.transaction().execute(async trx=>{
  await accessGate(trx);const p=await trx.selectFrom('oidc_providers').selectAll().where('id','=',initial.provider.id).executeTakeFirst();
  if(!p?.enabled||p.revision!==initial.provider.revision)fail('settings_conflict',409);
  const actor=intent==='link'?await authorize(trx,cookie??'',clock):null;
  if(actor&&actor.operatorId!==initial.actor?.operatorId)fail('unauthorized',401);
  const at=ms(clock());await trx.deleteFrom('oidc_transactions').where('expires_at','<=',at).execute();
  const n=Number((await trx.selectFrom('oidc_transactions').select(eb=>eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow()).n);if(n>=1024)fail('rate_limited',429);
  const auth=actor?await trx.selectFrom('operators').select('auth_version').where('id','=',actor.operatorId).executeTakeFirstOrThrow():null;
  await trx.insertInto('oidc_transactions').values({id:randomUUID(),provider_id:p.id,provider_revision:p.revision,state_digest:digest(state),browser_digest:digest(browser),nonce,pkce_verifier:verifier,intent,operator_id:actor?.operatorId??null,session_id:actor?.sessionId??null,auth_version:auth?.auth_version??null,issued_at:at,expires_at:new Date(at.getTime()+600000)}).execute();
  if(actor)await completeAuthorization(trx,actor,clock());
 });
 return {url:url.href,browser};
}
export function claimGroups(value:unknown){
 if(value===undefined)return [];if(!Array.isArray(value)||value.length>256||value.some(g=>typeof g!=='string'||!g||g.length>256||/[\p{Cc}\p{Cf}]/u.test(g)))fail('oidc_invalid_claims',400);
 return [...new Set(value as string[])];
}
export async function finishOidc(db:Kysely<Database>,url:URL,browser:string,origin:string,secret:string|undefined,clock:Clock,requestId:string,fetcher:typeof fetch=fetch){
 if(!secret||url.pathname!=='/api/v1/operator/oidc/callback'||url.origin!==origin||url.href.length>8192)fail('oidc_failed',400);
 const params=url.searchParams,state=params.get('state');
 if(!state||! /^[A-Za-z0-9_-]{43}$/.test(state)||! /^[A-Za-z0-9_-]{43}$/.test(browser)||[...params.keys()].length!==new Set(params.keys()).size)fail('oidc_failed',400);
 // Claim exactly once before provider I/O. A network failure requires a new
 // ceremony; an already exchanged authorization code is never retried.
 const pending=await db.transaction().execute(async trx=>{
  await accessGate(trx);const t=await trx.selectFrom('oidc_transactions').selectAll().where('state_digest','=',digest(state)).forUpdate().executeTakeFirst();
  const at=ms(clock());if(!t||!sameDigest(t.browser_digest,digest(browser))||at<t.issued_at||at>=t.expires_at)fail('oidc_failed',400);
  await trx.deleteFrom('oidc_transactions').where('id','=',t.id).execute();
  const p=await trx.selectFrom('oidc_providers').selectAll().where('id','=',t.provider_id).executeTakeFirst();if(!p?.enabled||p.revision!==t.provider_revision)fail('oidc_failed',400);
  return {transaction:t,provider:p};
 });
 const config=await oidcConfiguration(pending.provider,secret,fetcher);
 const result=await client.authorizationCodeGrant(config,url,{expectedState:state,expectedNonce:pending.transaction.nonce,pkceCodeVerifier:pending.transaction.pkce_verifier,idTokenExpected:true});
 const claims=result.claims();if(!claims||typeof claims.sub!=='string'||!claims.sub||claims.sub.length>255)fail('oidc_invalid_claims',400);
 // UserInfo is subject-checked by the client library. authentik may expose
 // profile and groups there rather than in the signed ID token.
 const info=config.serverMetadata().userinfo_endpoint?await client.fetchUserInfo(config,result.access_token,claims.sub):claims;
 const groups=claimGroups(info[pending.provider.groups_claim]??claims[pending.provider.groups_claim]);
 let profile={display_name:'',email:null as string|null};
 try{profile=profileInput({display_name:typeof info.name==='string'?info.name.slice(0,100):'',email:typeof info.email==='string'?info.email:null});}catch{/* Optional, malformed labels grant no authority. */}
 const subject=claims.sub;
 try{return await db.transaction().execute(async trx=>{
  await accessGate(trx,true);const p=await trx.selectFrom('oidc_providers').selectAll().where('id','=',pending.provider.id).executeTakeFirst();
  if(!p?.enabled||p.revision!==pending.transaction.provider_revision)fail('oidc_failed',400);
  const at=ms(clock());if(at>=pending.transaction.expires_at)fail('oidc_failed',400);
  let identity=await trx.selectFrom('operator_external_identities').selectAll().where('protocol','=','oidc').where('issuer','=',p.issuer).where('subject','=',subject).executeTakeFirst();
  let operatorId=identity?.operator_id??pending.transaction.operator_id;
  if(pending.transaction.intent==='link'){
   const target=await trx.selectFrom('operators').selectAll().where('id','=',pending.transaction.operator_id!).forUpdate().executeTakeFirst();
   const s=await trx.selectFrom('operator_sessions').selectAll().where('id','=',pending.transaction.session_id!).executeTakeFirst();
   if(!target||target.disabled_at||target.auth_version!==pending.transaction.auth_version||!s||s.operator_id!==target.id||s.auth_version!==target.auth_version||s.auth_method!=='local'||at>=s.expires_at||at<s.last_seen_at||at.getTime()-s.last_seen_at.getTime()>=1800000)fail('unauthorized',401);
   if(identity&&identity.operator_id!==target.id)fail('oidc_already_linked',409);
   operatorId=target.id;
  }
  let created=false;
  if(!operatorId){operatorId=randomUUID();
   const preferred=typeof info.preferred_username==='string'?info.preferred_username.toLowerCase().replace(/[^a-z0-9._@-]/g,'').slice(0,45):'';
   const base=/^[a-z0-9]/.test(preferred)?preferred:'sso';
   const exists=await trx.selectFrom('operators').select('id').where('login','=',base).executeTakeFirst();
   const login=base==='sso'||exists?base+'-'+operatorId.slice(0,8):base;
   await trx.insertInto('operators').values({id:operatorId,login,role:'user',disabled_at:null,recovery_admin:false,auth_version:1,created_at:at}).execute();created=true;
  }
  const op=await trx.selectFrom('operators').selectAll().where('id','=',operatorId).forUpdate().executeTakeFirstOrThrow();if(op.disabled_at)fail('unauthorized',401);
  if(!identity){const previous=await trx.selectFrom('operator_external_identities').select('id').where('operator_id','=',operatorId).where('provider_id','=',p.id).executeTakeFirst();if(previous)fail('oidc_already_linked',409);
   identity={id:randomUUID(),operator_id:operatorId,provider_id:p.id,protocol:'oidc',issuer:p.issuer,subject,created_at:at};await trx.insertInto('operator_external_identities').values(identity).execute();
  }
  if(identity.provider_id!==p.id)fail('oidc_failed',400);
  await ensureProfile(trx,operatorId);if(created)await trx.updateTable('operator_profiles').set(profile).where('operator_id','=',operatorId).execute();
  const old=await trx.selectFrom('access_external_memberships').select('group_id').where('provider_id','=',p.id).where('operator_id','=',operatorId).execute();
  const mapped=groups.length?await trx.selectFrom('oidc_group_mappings').select('group_id').where('provider_id','=',p.id).where('external_group','in',groups).execute():[];
  const next=[...new Set(mapped.map(m=>m.group_id))].sort(),before=old.map(m=>m.group_id).sort();
  if(JSON.stringify(next)!==JSON.stringify(before))await trx.deleteFrom('operator_sessions').where('operator_id','=',operatorId).where('id','!=',pending.transaction.session_id??randomUUID()).execute();
  await trx.deleteFrom('access_external_memberships').where('provider_id','=',p.id).where('operator_id','=',operatorId).execute();
  if(next.length)await trx.insertInto('access_external_memberships').values(next.map(group_id=>({provider_id:p.id,operator_id:operatorId!,group_id,valid_until:new Date(at.getTime()+3600000)}))).execute();
  const revision=await advanceAccess(trx);
  await audit(trx,{action:'access.changed',actorKind:'operator',operatorId,accessChange:{kind:pending.transaction.intent==='link'?'oidc_linked':'oidc_sign_in',target_id:operatorId,revision},at,correlationId:requestId});
  const session=pending.transaction.intent==='login'?await issueSession(trx,op,at,3600000,identity.id):null;
  return {session,intent:pending.transaction.intent};
 });}catch(e){if(isPgError(e,'23505'))fail('oidc_already_linked',409);throw e;}
}
