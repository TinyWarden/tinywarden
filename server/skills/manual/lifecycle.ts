import { agentContactAt } from "../../fleet/contact-evidence";
import type{Selectable,Transaction}from"kysely";
import type{Database}from"../../db/types";
import type{SkillManualRuns}from"../../db/manual-run-types";
import{commandFingerprint}from"../catalog/package-commands";
import{contactState}from"../../fleet/contact";
export const manualCapability="skill_runs.manual.v1";
export type ManualRow=Selectable<SkillManualRuns>;
export interface ManualScope{
  host_id:string;agent_id:string;generation:string;installation_id:string;content_sha256:string;
  enablement_version:string;settings_revision:string;policy_version:string;
}
export function contextKey(scope:ManualScope){return commandFingerprint("manual-context",scope.host_id,scope.agent_id,scope.generation,
  scope.installation_id,scope.content_sha256,scope.enablement_version,scope.settings_revision,scope.policy_version).toString("hex");}
export async function currentScope(trx:Transaction<Database>,host:string,id:string,at:Date){
  const row=await trx.selectFrom("skill_installations as i").innerJoin("skill_packages as p","p.content_sha256","i.content_sha256")
    .innerJoin("hosts as h",join=>join.on("h.id","=",host)).innerJoin("agents as a","a.host_id","h.id")
    .innerJoin("agent_credentials as c",join=>join.onRef("c.agent_id","=","a.id").onRef("c.generation","=","a.current_generation"))
    .leftJoin("host_skill_policies as policy",join=>join.onRef("policy.installation_id","=","i.id").onRef("policy.host_id","=","h.id"))
    .leftJoin("skill_runtime_hosts as runtime",join=>join.onRef("runtime.agent_id","=","a.id").onRef("runtime.generation","=","a.current_generation"))
    .select(["h.id as host_id","a.id as agent_id","a.current_generation as generation","i.id as installation_id","i.content_sha256",
      "i.enablement_version","i.settings_revision","policy.version as policy_version","i.enabled","a.revoked_at","c.revoked_at as credential_revoked",
      "c.accepted_at","c.last_contact_at","a.stale_after_seconds","runtime.ready","runtime.manual_runs_supported","h.architecture","p.metadata"])
    .where("i.id","=",id).executeTakeFirst();
  if(!row)return null;
  const scope:ManualScope={host_id:row.host_id,agent_id:row.agent_id,generation:row.generation,installation_id:row.installation_id,
    content_sha256:row.content_sha256,enablement_version:row.enablement_version,settings_revision:row.settings_revision,policy_version:row.policy_version??"0"};
  const valid=row.enabled&&!row.revoked_at&&!row.credential_revoked;
  const unavailable=!row.enabled?"disabled":!valid||contactState(row.revoked_at,agentContactAt(row),row.stale_after_seconds,at)!=="current"?"contact_unavailable":
    !row.ready||!row.metadata.manifest.compatibility.architectures.includes(row.architecture)?"runtime_unavailable":!row.manual_runs_supported?"agent_upgrade_required":null;
  return {scope,valid,unavailable};
}
export function failureReason(row:ManualRow,scope:ManualScope|null,at:Date){
  if(row.phase!=="queued"&&row.phase!=="running")return null;
  if(!scope||contextKey(row)!==contextKey(scope))return"scope_changed";
  if(row.phase==="queued"&&row.queue_expires_at<=at)return"queue_expired";
  if(row.phase==="running"&&row.result_deadline!<=at)return"result_timeout";
  return null;
}
export function summary(row:ManualRow,scope:ManualScope|null,at:Date){
  const reason=failureReason(row,scope,at);
  return{id:row.id,phase:reason?"failed" as const:row.phase,reason:reason??row.reason,requested_at:row.requested_at.toISOString(),
    started_at:row.started_at?.toISOString()??null,completed_at:reason?at.toISOString():row.completed_at?.toISOString()??null,run_id:row.run_id};
}
export async function expireRequests(trx:Transaction<Database>,host:string,at:Date){
  const rows=await trx.selectFrom("skill_manual_runs").selectAll().where("host_id","=",host).where("phase","in",["queued","running"]).limit(8).execute();
  for(const row of rows){const current=await currentScope(trx,host,row.installation_id,at),reason=failureReason(row,current?.valid?current.scope:null,at);
    if(reason)await trx.updateTable("skill_manual_runs").set({phase:"failed",reason,completed_at:at}).where("id","=",row.id).execute();}
}
