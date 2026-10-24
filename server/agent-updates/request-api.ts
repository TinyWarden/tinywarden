import type {Kysely} from "kysely";
import type {Database} from "../db/types";
import {accessGate} from "../access/scope";
import {authorizeAgent} from "../fleet/agent-authority";
import {exactObject,uuid} from "../validation";
import {fail} from "../errors";
import {activeMaintenance} from '../maintenance/fencing';
import {verifyRelease} from "./release";
import {activeUpdateStates,finishUpdateRequest,remoteUpdateCapability,settleHostUpdates} from "./requests";

const failures=["update_failed","update_repair_required","update_scope_changed","update_expired"];
export async function agentUpdateRequest(db:Kysely<Database>,credential:string,raw:unknown,clock:()=>Date){
  const v=exactObject(raw,["schema_version","host_id","agent_id","generation","request_id","state","error"]);
  if(v.schema_version!==1||!Number.isSafeInteger(v.generation)||Number(v.generation)<1||!["poll","installing","confirming","succeeded","failed"].includes(String(v.state)))fail("invalid_request",400);
  const hostId=uuid(v.host_id),agentId=uuid(v.agent_id),request=v.request_id===null?null:uuid(v.request_id);
  if(v.state!=="poll"&&!request||(v.state==="failed"?!failures.includes(String(v.error)):v.error!==null))fail("invalid_request",400);
  return db.transaction().execute(async trx=>{
    await accessGate(trx);
    // authorizeAgent locks host first, matching operator enqueue/reconciliation.
    const scope=await authorizeAgent(trx,credential,clock),at=scope.now;
    if(hostId!==scope.host.id||agentId!==scope.agent.id||String(v.generation)!==scope.agent.current_generation)fail("unauthorized",401);
    await settleHostUpdates(trx,scope.host,hostId,at);
    let query=trx.selectFrom("agent_update_requests").selectAll().where("host_id","=",hostId).where("agent_id","=",agentId).where("generation","=",scope.agent.current_generation);
    query=request?query.where("id","=",request):query.where("state","in",activeUpdateStates);
    let row=await query.orderBy("created_at").forUpdate().executeTakeFirst();
    if(request&&!row)fail("update_request_unknown",409);
    if(row&&activeUpdateStates.includes(row.state as typeof activeUpdateStates[number])&&await activeMaintenance(trx,hostId))fail('maintenance_busy',409);
    if(row&&activeUpdateStates.includes(row.state as typeof activeUpdateStates[number])&&v.state!=="poll"){
      if(v.state==="succeeded"){
        const report=await trx.selectFrom("agent_platform_reports").selectAll().where("agent_id","=",agentId).where("generation","=",scope.agent.current_generation).executeTakeFirst();
        const target=verifyRelease(Buffer.from(row.manifest),row.signature),o=report?.observation;
        if(!row.started_at||!report||report.received_at<row.started_at||!o||o.version!==row.target_version||o.installed_version!==row.target_version||o.binary_sha256!==target.binary_sha256||o.runtime_sha256!==target.runtime_sha256||o.descriptor_sha256!==target.descriptor_sha256)fail("update_confirmation_required",409);
        await finishUpdateRequest(trx,row,at,null);
      }else if(v.state==="failed")await finishUpdateRequest(trx,row,at,String(v.error));
      else{
        const state=row.state==="confirming"?"confirming":v.state as "installing"|"confirming";
        await trx.updateTable("agent_update_requests").set({state,started_at:row.started_at??at,updated_at:at}).where("id","=",row.id).execute();
        await trx.updateTable("fleet_operation_items").set({outcome:"update_"+state}).where("operation_id","=",row.operation_id).where("host_id","=",hostId).where("state","=","pending").execute();
      }
      row=await trx.selectFrom("agent_update_requests").selectAll().where("id","=",row.id).executeTakeFirstOrThrow();
    }
    return {schema_version:1,host_id:hostId,agent_id:agentId,generation:Number(scope.agent.current_generation),capability:remoteUpdateCapability,
      request:row?{id:row.id,state:row.state,error:row.error,expires_at:row.expires_at.toISOString(),candidate:{manifest:row.manifest,signature:row.signature}}:null};
  });
}
