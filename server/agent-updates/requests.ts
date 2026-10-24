import {randomUUID} from "node:crypto";
import type {Selectable,Transaction} from "kysely";
import type {Database,Hosts} from "../db/types";
import type {AgentUpdateTables} from "../db/agent-update-types";
import type {UpdateAvailability} from "../../lib/agent-updates";
import {readCatalog,freshCatalog} from "./catalog";
import {compare,compatible,supports,verifyRelease} from "./release";
import {nextCounter} from "../skills/catalog/package-commands";
import {fleetAudit} from "../fleet/management";
import {fail} from "../errors";
import {fleetActionReason} from "../../lib/fleet-actions";
import {activeMaintenance,assertMaintenanceIdle} from '../maintenance/fencing';

export const remoteUpdateCapability="agent_update_requests.v1";
export const activeUpdateStates=["queued","installing","confirming"] as const;
export type UpdateRequest=Selectable<AgentUpdateTables["agent_update_requests"]>;
type Trx=Transaction<Database>;

/** Local automatic updates and remote requests both exclude reconnect setup. */
export async function activeAgentUpdate(trx:Trx,host:string,at:Date){
  const request=await trx.selectFrom('agent_update_requests').select('id').where('host_id','=',host).where('state','in',activeUpdateStates).where('expires_at','>',at).executeTakeFirst();
  if(request)return true;
  const report=await trx.selectFrom('agents as a').innerJoin('agent_platform_reports as r',j=>j.onRef('r.agent_id','=','a.id').onRef('r.generation','=','a.current_generation')).select('r.observation').where('a.host_id','=',host).where('a.revoked_at','is',null).executeTakeFirst();
  return !!report&&['installing','awaiting_confirmation'].includes(report.observation.updater.outcome);
}

/** Capabilities and immutable target selection are independent of online health. */
export async function updateAvailability(trx:Trx,hosts:Selectable<Hosts>[],at:Date){
  const result=new Map<string,UpdateAvailability>();if(!hosts.length)return result;
  const ids=hosts.map(h=>h.id),catalog=await readCatalog(trx);
  const rows=await trx.selectFrom("agents as a").leftJoin("agent_platform_reports as r",j=>j.onRef("r.agent_id","=","a.id").onRef("r.generation","=","a.current_generation"))
    .select(["a.id","a.host_id","a.revoked_at","r.observation","r.observed_at"]).where("a.host_id","in",ids).execute();
  const active=await trx.selectFrom("agent_update_requests").select("host_id").where("host_id","in",ids).where("state","in",activeUpdateStates).where("expires_at",">",at).execute();
  for(const host of hosts){
    const row=rows.find(r=>r.host_id===host.id),o=row?.observation;
    const in_progress=active.some(r=>r.host_id===host.id)||!!o&&["installing","awaiting_confirmation"].includes(o.updater.outcome);
    let reason:string|null=null,version:string|null=null;
    if(!["active","paused"].includes(host.lifecycle)||!row||row.revoked_at)reason="update_host_ineligible";
    else if(await activeMaintenance(trx,host.id))reason="maintenance_busy";
    else if(!o?.managed)reason="update_managed_required";
    else if(!o.remote_updates)reason="update_agent_upgrade_required";
    else if(in_progress)reason="update_in_progress";
    else if(o.updater.outcome==="failed")reason="update_repair_required";
    else if(!freshCatalog(catalog,at))reason="update_catalog_unavailable";
    else if(host.os_id!=="debian"||host.os_version!=="13"||host.architecture!=="amd64")reason="update_host_ineligible";
    else{
      const known=catalog.releases.find(r=>r.metadata.version===o.version)?.metadata;
      if(!known||known.binary_sha256!==o.binary_sha256||known.runtime_sha256!==o.runtime_sha256||known.descriptor_sha256!==o.descriptor_sha256||!row.observed_at||row.observed_at>at)reason="update_identity_unverified";
      else{
        const target=catalog.releases.find(r=>supports(r.metadata)&&compatible(r.metadata,o.version)&&compare(r.metadata.version,o.version)>0);
        if(target)version=target.metadata.version;else reason="update_already_current";
      }
    }
    result.set(host.id,{available:reason===null,version,reason,in_progress});
  }
  return result;
}

/** Call only after locking the host, then the request; preserves Fleet lock order. */
export async function finishUpdateRequest(trx:Trx,row:UpdateRequest,at:Date,error:string|null){
  if(!activeUpdateStates.includes(row.state as typeof activeUpdateStates[number]))return;
  await trx.updateTable("agent_update_requests").set({state:error?"failed":"succeeded",error,updated_at:at,completed_at:at}).where("id","=",row.id).execute();
  await trx.updateTable("fleet_operation_items").set({state:error?"failed":"completed",outcome:error??"update_succeeded",completed_at:at})
    .where("operation_id","=",row.operation_id).where("host_id","=",row.host_id).where("state","=","pending").execute();
  await fleetAudit(trx,null,row.host_id,error?"update_failed":"update_succeeded",at,row.operation_id,{request_id:row.id,version:row.target_version,...(error?{error}:{})});
}
export async function settleHostUpdates(trx:Trx,host:Selectable<Hosts>|undefined,id:string,at:Date){
  const rows=await trx.selectFrom("agent_update_requests").selectAll().where("host_id","=",id).where("state","in",activeUpdateStates).forUpdate().execute();
  for(const row of rows){
    if(at<row.updated_at)fail("temporarily_unavailable",503);
    const agent=await trx.selectFrom("agents").select(["id","current_generation","revoked_at"]).where("id","=",row.agent_id).executeTakeFirst();
    const owner=await trx.selectFrom("fleet_operations as f").innerJoin("operators as o","o.id","f.operator_id").select(["o.role","o.disabled_at"]).where("f.id","=",row.operation_id).executeTakeFirst();
    const reason=!owner||owner.role!=="admin"||owner.disabled_at||!host||!["active","paused"].includes(host.lifecycle)||!agent||agent.revoked_at||agent.current_generation!==row.generation?"update_scope_changed":row.expires_at<=at?"update_expired":null;
    if(reason)await finishUpdateRequest(trx,row,at,reason);
  }
}
export async function settleOperationUpdates(trx:Trx,operation:string,at:Date){
  const rows=await trx.selectFrom("agent_update_requests").select("host_id").where("operation_id","=",operation).where("state","in",activeUpdateStates).orderBy("host_id").execute();
  for(const row of rows){const host=await trx.selectFrom("hosts").selectAll().where("id","=",row.host_id).forUpdate().executeTakeFirst();await settleHostUpdates(trx,host,row.host_id,at);}
}

export async function queueUpdate(trx:Trx,host:Selectable<Hosts>,operation:string,actor:string,version:string|null,at:Date){
  await assertMaintenanceIdle(trx,host.id);
  await settleHostUpdates(trx,host,host.id,at);
  const availability=(await updateAvailability(trx,[host],at)).get(host.id)!;
  if(fleetActionReason('update',{lifecycle:host.lifecycle,control_supported:false,maintenance:null,update:availability})!==null){
    if(availability.reason==="update_already_current"){
      await trx.updateTable("fleet_operation_items").set({state:"not_applicable",outcome:availability.reason,completed_at:at}).where("operation_id","=",operation).where("host_id","=",host.id).execute();return;
    }
    fail(availability.reason!,409);
  }
  if(!version)fail("update_target_changed",409);
  const agent=await trx.selectFrom("agents").selectAll().where("host_id","=",host.id).where("revoked_at","is",null).executeTakeFirstOrThrow();
  const report=await trx.selectFrom("agent_platform_reports").select("observation").where("agent_id","=",agent.id).where("generation","=",agent.current_generation).executeTakeFirstOrThrow();
  const catalog=await readCatalog(trx),target=catalog.releases.find(r=>r.metadata.version===version);
  if(!target||!freshCatalog(catalog,at)||!supports(target.metadata)||!compatible(target.metadata,report.observation.version)||compare(version,report.observation.version)<=0)fail("update_target_changed",409);
  // Reverify stored signed bytes; a request never accepts a caller-supplied URL.
  try{if(verifyRelease(Buffer.from(target.manifest),target.signature).version!==version)fail("update_identity_unverified",409);}
  catch{fail("update_identity_unverified",409);}
  const id=randomUUID(),revision=nextCounter(host.fleet_revision);
  await trx.insertInto("agent_update_requests").values({id,operation_id:operation,host_id:host.id,agent_id:agent.id,generation:agent.current_generation,
    target_version:version,manifest:target.manifest,signature:target.signature,state:"queued",error:null,created_at:at,updated_at:at,expires_at:new Date(+at+86400000),started_at:null,completed_at:null}).execute();
  await trx.updateTable("hosts").set({fleet_revision:revision}).where("id","=",host.id).execute();
  await trx.updateTable("fleet_operation_items").set({outcome:"update_queued",revision}).where("operation_id","=",operation).where("host_id","=",host.id).execute();
  await fleetAudit(trx,actor,host.id,"update_requested",at,operation,{request_id:id,version,revision});
}
