import {createHash,randomUUID} from "node:crypto";
import type {Kysely,Transaction} from "kysely";
import type {Database,LocalCredentials} from "../db/types";
import {AppError,fail,isPgError} from "../errors";
import {ms,newCredential,password,sameDigest} from "../validation";
import {audit} from "./audit";
import {hashPassword,verifyPassword} from "./password";
import {accessGate} from "./scope";
import {authorize,completeAuthorization} from "./session";
export type Clock=()=>Date;
export function accountLogin(raw:unknown){if(typeof raw!=="string")fail("invalid_request",400);const name=raw.trim().toLowerCase();if(!/^[a-z0-9][a-z0-9._@-]{0,63}$/.test(name))fail("invalid_request",400);return name;}
export function credentialValues(hashed:{salt:Buffer;hash:Buffer},at:Date,required:boolean){return {password_algorithm:"scrypt-v1",password_n:131072,password_r:8,password_p:1,password_salt:hashed.salt,password_hash:hashed.hash,password_changed_at:at,must_change_password:required};}
export async function advanceAccess(trx:Transaction<Database>){const row=await trx.selectFrom("access_control_state").select("revision").where("singleton","=",true).executeTakeFirstOrThrow();const revision=Number(row.revision)+1;if(!Number.isSafeInteger(revision))fail("version_exhausted",409);await trx.updateTable("access_control_state").set({revision}).where("singleton","=",true).execute();return String(revision);}
export async function initOperator(db:Kysely<Database>,raw:unknown,clock:Clock,correlationId:string=randomUUID()){
 const hashed=await hashPassword(raw);
 try{await db.transaction().execute(async trx=>{await accessGate(trx,true);if(await trx.selectFrom("operators").select("id").executeTakeFirst())fail("operator_exists",409);
 const at=ms(clock()),id=randomUUID();await trx.insertInto("operators").values({id,login:"admin",role:"admin",disabled_at:null,recovery_admin:true,auth_version:1,created_at:at}).execute();
 await trx.insertInto("operator_local_credentials").values({operator_id:id,...credentialValues(hashed,at,false)}).execute();await advanceAccess(trx);
 await audit(trx,{action:"operator.initialized",actorKind:"system",targetOperatorId:id,at,correlationId});});}
 catch(e){if(isPgError(e,"23505"))throw new AppError("operator_exists",409);throw e;}
}
export async function resetPassword(db:Kysely<Database>,raw:unknown,clock:Clock,correlationId:string=randomUUID()){
 const old=await db.selectFrom("operators").select(["id","auth_version"]).where("recovery_admin","=",true).executeTakeFirst();if(!old)fail("setup_required",503);
 const hashed=await hashPassword(raw);await db.transaction().execute(async trx=>{await accessGate(trx,true);const op=await trx.selectFrom("operators").selectAll().where("id","=",old.id).forUpdate().executeTakeFirst();
 if(!op||op.auth_version!==old.auth_version)fail("operator_changed",409);const at=ms(clock());await replaceCredential(trx,op.id,op.auth_version,hashed,at,false);await advanceAccess(trx);
 await audit(trx,{action:"operator.password_reset",actorKind:"system",targetOperatorId:op.id,at,correlationId});});
}
export async function replaceCredential(trx:Transaction<Database>,id:string,version:string,hashed:{salt:Buffer;hash:Buffer},at:Date,required:boolean){
 const next=Number(version)+1;if(!Number.isSafeInteger(next))fail("version_exhausted",409);
 await trx.insertInto("operator_local_credentials").values({operator_id:id,...credentialValues(hashed,at,required)}).onConflict(c=>c.column("operator_id").doUpdateSet(credentialValues(hashed,at,required))).execute();
 await trx.updateTable("operators").set({auth_version:next}).where("id","=",id).execute();await trx.deleteFrom("operator_sessions").where("operator_id","=",id).execute();
}
async function reserveLoginAttempt(db:Kysely<Database>,name:string,clock:Clock){const bucket=createHash("sha256").update(name).digest().readUInt16BE(0)%1024;
 await db.transaction().execute(async trx=>{const initial=ms(clock());await trx.insertInto("login_throttle").values({singleton:true,window_started_at:initial,attempts:0}).onConflict(c=>c.column("singleton").doNothing()).execute();
 const global=await trx.selectFrom("login_throttle").selectAll().where("singleton","=",true).forUpdate().executeTakeFirstOrThrow();
 await trx.insertInto("login_throttle_buckets").values({bucket,window_started_at:initial,attempts:0}).onConflict(c=>c.column("bucket").doNothing()).execute();
 const local=await trx.selectFrom("login_throttle_buckets").selectAll().where("bucket","=",bucket).forUpdate().executeTakeFirstOrThrow();const at=ms(clock());
 for(const [row,max] of [[global,30],[local,5]] as const){const elapsed=at.getTime()-row.window_started_at.getTime();if(elapsed<60000&&row.attempts>=max)throw new AppError("rate_limited",429,Math.max(1,Math.ceil((60000-Math.max(0,elapsed))/1000)));}
 const values=(row:{window_started_at:Date;attempts:number})=>at.getTime()-row.window_started_at.getTime()>=60000?{window_started_at:at,attempts:1}:{attempts:row.attempts+1};
 await trx.updateTable("login_throttle").set(values(global)).where("singleton","=",true).execute();await trx.updateTable("login_throttle_buckets").set(values(local)).where("bucket","=",bucket).execute();});
}
const dummy={password_algorithm:"scrypt-v1",password_n:131072,password_r:8,password_p:1,password_salt:Buffer.alloc(16,37),password_hash:Buffer.alloc(64,91)};
export async function login(db:Kysely<Database>,rawName:unknown,rawPassword:unknown,clock:Clock,correlationId:string=randomUUID()):Promise<string>{
 const name=accountLogin(rawName);password(rawPassword);await reserveLoginAttempt(db,name,clock);
 const old=await db.selectFrom("operators as o").leftJoin("operator_local_credentials as c","c.operator_id","o.id").selectAll("o").select(["c.password_algorithm","c.password_n","c.password_r","c.password_p","c.password_salt","c.password_hash"]).where("o.login","=",name).executeTakeFirst();
 if(!old&&!await db.selectFrom("operators").select("id").executeTakeFirst())fail("setup_required",503);
 const candidate=old?.password_hash&&old.password_salt?old as typeof old&LocalCredentials:dummy;
 const matched=await verifyPassword(rawPassword,candidate);
 return db.transaction().execute(async trx=>{await accessGate(trx);if(!old)fail("unauthorized",401);const op=await trx.selectFrom("operators").selectAll().where("id","=",old.id).forUpdate().executeTakeFirst();
 const credential=await trx.selectFrom("operator_local_credentials").selectAll().where("operator_id","=",old.id).executeTakeFirst();
 if(!matched||!op||op.disabled_at||!credential||!old.password_hash||op.auth_version!==old.auth_version||!sameDigest(credential.password_hash,old.password_hash))fail("unauthorized",401);
 const at=ms(clock());if(at<op.created_at)fail("unauthorized",401);
 const sessions=await trx.selectFrom("operator_sessions").selectAll().where("operator_id","=",op.id).orderBy("issued_at").orderBy("id").execute();
 const live=[];for(const s of sessions){if(at<s.issued_at||at>=s.expires_at||at.getTime()-s.last_seen_at.getTime()>=1800000)await trx.deleteFrom("operator_sessions").where("id","=",s.id).execute();else live.push(s);}
 if(live.length>=5)await trx.deleteFrom("operator_sessions").where("id","=",live[0]!.id).execute();
 const session=newCredential("session");await trx.insertInto("operator_sessions").values({id:session.id,operator_id:op.id,secret_digest:session.digest,auth_version:op.auth_version,issued_at:at,last_seen_at:at,expires_at:new Date(at.getTime()+28800000)}).execute();
 await audit(trx,{action:"operator.login",actorKind:"operator",operatorId:op.id,at,correlationId});return session.value;});
}
export async function changePassword(db:Kysely<Database>,cookie:string,current:unknown,next:unknown,clock:Clock,correlationId:string=randomUUID()){
 password(current);password(next);if(current===next)fail("password_unchanged",400);
 const old=await db.transaction().execute(async trx=>{const actor=await authorize(trx,cookie,clock,true);const credential=await trx.selectFrom("operator_local_credentials").selectAll().where("operator_id","=",actor.operatorId).executeTakeFirst();if(!credential)fail("forbidden",403);await completeAuthorization(trx,actor,clock());const op=await trx.selectFrom("operators").select("auth_version").where("id","=",actor.operatorId).executeTakeFirstOrThrow();return {actor,credential,version:op.auth_version};});
 if(!await verifyPassword(current,old.credential))fail("invalid_password",400);const hashed=await hashPassword(next);
 await db.transaction().execute(async trx=>{await accessGate(trx,true);const actor=await authorize(trx,cookie,clock,true);const credential=await trx.selectFrom("operator_local_credentials").selectAll().where("operator_id","=",actor.operatorId).executeTakeFirst();const op=await trx.selectFrom("operators").select("auth_version").where("id","=",actor.operatorId).executeTakeFirstOrThrow();
 if(actor.operatorId!==old.actor.operatorId||op.auth_version!==old.version||!credential||!sameDigest(credential.password_hash,old.credential.password_hash))fail("settings_conflict",409);
 const at=await completeAuthorization(trx,actor,clock());await replaceCredential(trx,actor.operatorId,op.auth_version,hashed,at,false);const revision=await advanceAccess(trx);
 await audit(trx,{action:"access.changed",actorKind:"operator",operatorId:actor.operatorId,accessChange:{kind:"password_changed",target_id:actor.operatorId,revision},at,correlationId});});
}
