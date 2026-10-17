import {createHash,randomUUID} from 'node:crypto';
import type {Kysely,Transaction} from 'kysely';
import type {Database} from '../db/types';
import {fail,AppError} from '../errors';
import {ms,sameDigest} from '../validation';
import {accountLogin,type Clock} from '../access/operator';
import {authorize,completeAuthorization} from '../access/session';
import {accessGate} from '../access/scope';
import {verifyPassword} from '../access/password';
import {ensureProfile} from '../access/profile';
import {audit} from '../access/audit';
function limited():never{throw new AppError('rate_limited',429,60);}
const digest=(s:string)=>createHash('sha256').update(s).digest();
async function bucket(trx:Transaction<Database>,name:string,at:Date,max:number,window:number){
 const key=digest(name);await trx.insertInto('account_email_throttle').values({key,started_at:at,count:0}).onConflict(c=>c.column('key').doNothing()).execute();
 const old=await trx.selectFrom('account_email_throttle').selectAll().where('key','=',key).forUpdate().executeTakeFirstOrThrow();
 const reset=at.getTime()-old.started_at.getTime()>=window;if(!reset&&old.count>=max)return false;
 await trx.updateTable('account_email_throttle').set({count:reset?1:old.count+1,started_at:reset?at:old.started_at}).where('key','=',key).execute();return true;
}
export async function reserveMailRequest(db:Kysely<Database>,name:string,clock:Clock){return db.transaction().execute(async trx=>{
 const at=ms(clock());if(!await bucket(trx,'global-requests',at,90,60000))limited();
 return await bucket(trx,'hour:'+name,at,5,3600000)&&await bucket(trx,'minute:'+name,at,1,60000);
});}
export async function reserveTicketAttempt(db:Kysely<Database>,clock:Clock){await db.transaction().execute(async trx=>{if(!await bucket(trx,'global-ticket-attempts',ms(clock()),90,60000))limited();});}
export async function enqueueRecovery(db:Kysely<Database>,raw:unknown,clock:Clock){
 const login=accountLogin(raw);if(!await reserveMailRequest(db,'reset:'+login,clock))return;
 // Every well-formed username follows the same enqueue path. Eligibility is
 // resolved by the worker, never during this anonymous response.
 await db.transaction().execute(async trx=>{const n=Number((await trx.selectFrom('account_email_jobs').select(eb=>eb.fn.countAll<string>().as('n')).where('state','=','queued').executeTakeFirstOrThrow()).n);if(n>=512)return;
 await trx.insertInto('account_email_jobs').values({id:randomUUID(),purpose:'reset',login,operator_id:null,auth_version:null,email_revision:null,email:null,state:'queued',outcome:null,created_at:ms(clock()),claimed_at:null,finished_at:null}).execute();});
}
export async function enqueueVerification(db:Kysely<Database>,cookie:string,raw:Record<string,unknown>,clock:Clock,correlationId:string){
 const initial=await db.transaction().execute(async trx=>{const actor=await authorize(trx,cookie,clock);await ensureProfile(trx,actor.operatorId);
 const op=await trx.selectFrom('operators').selectAll().where('id','=',actor.operatorId).executeTakeFirstOrThrow(),profile=await trx.selectFrom('operator_profiles').selectAll().where('operator_id','=',op.id).executeTakeFirstOrThrow();
 if(raw.expected_revision!==profile.revision)fail('settings_conflict',409);if(!profile.email)fail('email_required',400);if(profile.email_verified_at)fail('email_already_verified',409);
 const credential=await trx.selectFrom('operator_local_credentials').selectAll().where('operator_id','=',op.id).executeTakeFirst();await completeAuthorization(trx,actor,clock());return {actor,op,profile,credential};});
 await db.transaction().execute(async trx=>{const at=ms(clock());if(!await bucket(trx,'proof:'+initial.op.id,at,5,60000))limited();});
 if(initial.credential){if(!await verifyPassword(raw.current_password,initial.credential))fail('invalid_password',400);}
 else if(raw.current_password!==null||initial.actor.authMethod!=='oidc'||initial.actor.at.getTime()-initial.actor.issuedAt.getTime()>15*60000)fail('email_recent_sign_in_required',409);
 if(!await reserveMailRequest(db,'verify:'+initial.op.id,clock))limited();
 await db.transaction().execute(async trx=>{await accessGate(trx);const actor=await authorize(trx,cookie,clock);if(actor.operatorId!==initial.op.id)fail('unauthorized',401);
 const op=await trx.selectFrom('operators').selectAll().where('id','=',actor.operatorId).executeTakeFirstOrThrow(),profile=await trx.selectFrom('operator_profiles').selectAll().where('operator_id','=',op.id).forUpdate().executeTakeFirstOrThrow();
 const credential=await trx.selectFrom('operator_local_credentials').selectAll().where('operator_id','=',op.id).executeTakeFirst();
 if(op.auth_version!==initial.op.auth_version||profile.revision!==initial.profile.revision||credential&&!initial.credential||initial.credential&&(!credential||!sameDigest(credential.password_hash,initial.credential.password_hash)))fail('settings_conflict',409);
 if(!credential&&(actor.authMethod!=='oidc'||actor.at.getTime()-actor.issuedAt.getTime()>15*60000))fail('email_recent_sign_in_required',409);
 const n=Number((await trx.selectFrom('account_email_jobs').select(eb=>eb.fn.countAll<string>().as('n')).where('state','=','queued').executeTakeFirstOrThrow()).n);if(n>=512)fail('temporarily_unavailable',503);
 const at=await completeAuthorization(trx,actor,clock());await trx.insertInto('account_email_jobs').values({id:randomUUID(),purpose:'verify',login:op.login,operator_id:op.id,auth_version:op.auth_version,email_revision:profile.email_revision,email:profile.email,state:'queued',outcome:null,created_at:at,claimed_at:null,finished_at:null}).execute();
 await audit(trx,{action:'access.changed',actorKind:'operator',operatorId:op.id,accessChange:{kind:'email_verification_requested',target_id:op.id,revision:actor.accessRevision},at,correlationId});
 });
}
