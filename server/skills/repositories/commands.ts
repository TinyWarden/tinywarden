import {type Kysely,type Transaction} from "kysely";
import type {Database} from "../../db/types";
import {accessGate,requireAdmin} from "../../access/scope";
import {authorize,completeAuthorization,type SessionContext} from "../../access/session";
import {packageLock,commandFingerprint,packageRead} from "../catalog/package-commands";
import {sameDigest,uuid} from "../../validation";
import {fail} from "../../errors";
import {jsonValue} from "../../db/json";
export type Db=Kysely<Database>;export type Trx=Transaction<Database>;
export async function repositoryReplay(db:Db,cookie:string,request:string,action:string,input:unknown,clock:()=>Date){
  uuid(request);return packageRead(db,async trx=>{const actor=await authorize(trx,cookie,clock);requireAdmin(actor);
    const result=await receipt(trx,actor.operatorId,request,commandFingerprint(`repository:${action}`,input),actor.at);
    await completeAuthorization(trx,actor,clock());return result;});
}
export async function receipt(trx:Trx,actor:string,request:string,fp:Buffer,at=new Date()){
  const old=await trx.selectFrom("skill_repository_mutations").selectAll().where("operator_id","=",actor).where("request_id","=",request).executeTakeFirst();
  if(old&&!sameDigest(old.fingerprint,fp))fail("idempotency_conflict",409);
  if(old&&(old.result as {pending?:boolean})?.pending){if(at.getTime()-old.completed_at.getTime()>120000)fail("repository_interrupted",409);fail("repository_busy",503);}
  return old?.result;
}
export async function mutate<T>(db:Db,cookie:string,request:string,action:string,input:unknown,clock:()=>Date,
  run:(trx:Trx,actor:SessionContext)=>Promise<T>){
  uuid(request);const fp=commandFingerprint(`repository:${action}`,input);
  return db.transaction().execute(async trx=>{
    await accessGate(trx);await packageLock(trx);const actor=await authorize(trx,cookie,clock);requireAdmin(actor);
    const saved=await receipt(trx,actor.operatorId,request,fp,actor.at);if(saved)return saved as T;
    const result=await run(trx,actor);await completeAuthorization(trx,actor,clock());
    await trx.insertInto("skill_repository_mutations").values({operator_id:actor.operatorId,request_id:request,fingerprint:fp,action,result:jsonValue(result&&typeof result==="object"&&(result as {pending?:boolean}).pending?{pending:true}:result),completed_at:actor.at}).execute();
    return result;
  });
}
export async function finish<T>(db:Db,cookie:string,request:string,clock:()=>Date,run:(trx:Trx,actor:SessionContext)=>Promise<T>){
  return db.transaction().execute(async trx=>{
    await accessGate(trx);await packageLock(trx);const actor=await authorize(trx,cookie,clock);requireAdmin(actor);
    const row=await trx.selectFrom("skill_repository_mutations").selectAll().where("operator_id","=",actor.operatorId).where("request_id","=",request).executeTakeFirstOrThrow();
    if(!(row.result as {pending?:boolean})?.pending)return row.result as T;
    const result=await run(trx,actor);await completeAuthorization(trx,actor,clock());
    await trx.updateTable("skill_repository_mutations").set({result:jsonValue(result),completed_at:actor.at}).where("operator_id","=",actor.operatorId).where("request_id","=",request).execute();return result;
  });
}
