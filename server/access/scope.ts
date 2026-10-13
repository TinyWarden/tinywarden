import {sql,type Transaction} from "kysely";
import type {Database} from "../db/types";
import {fail} from "../errors";
export type Role="admin"|"user";
export interface AccessActor {operatorId:string;role:Role;accessRevision:string}
export async function accessGate(trx:Transaction<Database>,exclusive=false){
  const q=trx.selectFrom("access_control_state").select("revision").where("singleton","=",true);
  const row=await (exclusive?q.forUpdate():q.forShare()).executeTakeFirstOrThrow();return row.revision;
}
export function requireAdmin(actor:AccessActor){if(actor.role!=="admin")fail("forbidden",403);}
export async function localAdministrator(trx:Transaction<Database>){
  await accessGate(trx);
  const account=await trx.selectFrom("operators").innerJoin("operator_local_credentials","operator_local_credentials.operator_id","operators.id")
    .select(["operators.id","operators.auth_version"]).where("operators.role","=","admin").where("operators.disabled_at","is",null)
    .where("operator_local_credentials.must_change_password","=",false).orderBy("operators.recovery_admin","desc").orderBy("operators.login").orderBy("operators.id").executeTakeFirst();
  if(!account)fail("no_local_admin",403);return account;
}
export function hostScope(actor:AccessActor,hostColumn:string){
  if(actor.role==="admin")return sql<boolean>`TRUE`;
  const host=sql.ref(hostColumn);
  return sql<boolean>`(EXISTS(SELECT 1 FROM tinywarden.access_user_hosts au WHERE au.operator_id=${actor.operatorId}::uuid AND au.host_id=${host})
    OR EXISTS(SELECT 1 FROM tinywarden.access_group_members am JOIN tinywarden.access_group_hosts ag ON ag.group_id=am.group_id
      WHERE am.operator_id=${actor.operatorId}::uuid AND ag.host_id=${host}))`;
}
export async function requireHostAccess(trx:Transaction<Database>,actor:AccessActor,id:string){
  if(!await trx.selectFrom("hosts").select("id").where("id","=",id).where(hostScope(actor,"hosts.id")).executeTakeFirst())fail("not_found",404);
}
export function accessView(actor:AccessActor){return {account_id:actor.operatorId,revision:actor.accessRevision};}
