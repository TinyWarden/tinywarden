import {requireAdmin} from "../access/scope";
import type {Kysely,Transaction} from "kysely";
import type {Database} from "../db/types";
import {authorize,completeAuthorization} from "../access/session";
import {audit} from "../access/audit";
import {fail} from "../errors";
import {uuid,sameDigest} from "../validation";
import {commandFingerprint,nextCounter} from "../skills/catalog/package-commands";
import {snapshotRead} from "../db/snapshot-read";
import {readCatalog} from "./catalog";
type Db=Kysely<Database>|Transaction<Database>;
export async function settings(db:Db,host?:string){
  const defaults=await db.selectFrom("agent_update_defaults").selectAll().where("singleton","=",true).executeTakeFirstOrThrow();
  const override=host?await db.selectFrom("host_agent_update_policies").selectAll().where("host_id","=",host).executeTakeFirst():undefined;
  return {defaults,override,effective:override?.automatic??defaults.automatic};
}
export async function readDefaults(db:Kysely<Database>,cookie:string,clock=()=>new Date()){
  return snapshotRead(db,async trx=>{const actor=await authorize(trx,cookie,clock);requireAdmin(actor);const [s,c]=await Promise.all([settings(trx),readCatalog(trx)]);await completeAuthorization(trx,actor,clock());
    return {as_of:actor.at.toISOString(),automatic:s.defaults.automatic,revision:s.defaults.revision,catalog_at:c.checked_at?.toISOString()??null,catalog_error:c.error,newest_version:c.releases[0]?.metadata.version??null};});
}
export async function savePolicy(db:Kysely<Database>,cookie:string,raw:{request_id:unknown;expected_revision:unknown;automatic:unknown},host:string|undefined,clock:()=>Date,correlationId:string){
  const request=uuid(raw.request_id),expected=raw.expected_revision;
  if(typeof expected!=="string"||!/^(0|[1-9][0-9]{0,15})$/.test(expected)||!Number.isSafeInteger(Number(expected))||typeof raw.automatic!=="boolean"&&!(host&&raw.automatic===null))fail("invalid_request",400);
  const automatic=raw.automatic as boolean|null,digest=commandFingerprint("agent-update-policy",host??null,expected,automatic);
  return db.transaction().execute(async trx=>{
    const actor=await authorize(trx,cookie,clock);requireAdmin(actor);
    if(host){const row=await trx.selectFrom("hosts").where("lifecycle","!=","deleting").select("id").where("id","=",uuid(host)).forUpdate().executeTakeFirst();if(!row)fail("not_found",404);}
    await trx.selectFrom("agent_update_defaults").select("singleton").where("singleton","=",true).forUpdate().executeTakeFirstOrThrow();
    const s=await settings(trx,host),old=host?s.override:s.defaults,revision=old?.revision??"0";
    if(old?.last_request_id===request){if(!old.last_fingerprint||!sameDigest(old.last_fingerprint,digest))fail("idempotency_conflict",409);await completeAuthorization(trx,actor,clock());return {revision};}
    if(revision!==expected)fail("settings_conflict",409);
    const values={automatic,revision:nextCounter(revision),updated_at:actor.at,last_request_id:request,last_fingerprint:digest};
    if(host)await trx.insertInto("host_agent_update_policies").values({host_id:host,...values}).onConflict(c=>c.column("host_id").doUpdateSet(values)).execute();
    else await trx.updateTable("agent_update_defaults").set({...values,automatic:automatic!}).where("singleton","=",true).execute();
    if(old?.automatic!==automatic)await audit(trx,{action:host?"agent.update_policy":"agent.update_defaults",actorKind:"operator",operatorId:actor.operatorId,...(host?{hostId:host}:{}),at:actor.at,correlationId});
    await completeAuthorization(trx,actor,clock());return {revision:values.revision};
  });
}
