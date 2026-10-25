import {usesResourceCollections} from '../../../lib/skills/resource-mode';
import {requireAdmin,accessGate} from "../../access/scope";
import type{Transaction}from"kysely";
import type{Database}from"../../db/types";
import{authorize,completeAuthorization}from"../../access/session";
import{uuid}from"../../validation";
import{fail}from"../../errors";
import{packageLock,mutationReplay,recordMutation,commandFingerprint,type PackageDb}from"../catalog/package-commands";
import{currentScope,contextKey,summary,type ManualScope}from"./lifecycle";
import {enqueueManualRun} from "./queue";
import type{PackageProjection}from"../results/package-projection";
export async function manualFeedback(trx:Transaction<Database>,host:string,skills:PackageProjection[],at:Date){
  const machine=await trx.selectFrom("hosts").select(["architecture","lifecycle","monitoring_epoch"]).where("id","=",host).executeTakeFirstOrThrow();
  const runtime=await trx.selectFrom("skill_runtime_hosts").selectAll().where("host_id","=",host).executeTakeFirst();
  const latest=await trx.selectFrom("skill_manual_runs").selectAll().distinctOn("installation_id").where("host_id","=",host)
    .orderBy("installation_id").orderBy("requested_at","desc").orderBy("id","desc").limit(100).execute();
  return skills.map(skill=>{
    const scope:ManualScope|null=skill.agent_id&&skill.generation?{monitoring_epoch:machine.monitoring_epoch,host_id:host,agent_id:skill.agent_id,generation:skill.generation,
      installation_id:skill.installation_id,content_sha256:skill.content_sha256,enablement_version:skill.enablement_version,
      settings_revision:skill.source_revision,policy_version:skill.policy_version}:null;
    const unavailable_reason=machine.lifecycle!=="active"?"monitoring_paused":!skill.enabled?"disabled":!skill.eligible||!skill.contact_current?"contact_unavailable":
      !runtime?.ready||runtime.generation!==skill.generation||!skill.metadata.manifest.compatibility.architectures.includes(machine.architecture)?"runtime_unavailable":!runtime.manual_runs_supported||skill.metadata.manifest.sdk===3&&!runtime.sdk3_support||usesResourceCollections(skill.metadata)&&!runtime.resource_support?"agent_upgrade_required":null;
    const row=latest.find(r=>r.installation_id===skill.installation_id);
    return{...skill,manual_run:{can_request:!unavailable_reason,unavailable_reason,expected_context:scope?contextKey(scope):null,
      latest:row?summary(row,skill.eligible?scope:null,at):null}};
  });
}
export async function requestManualRun(db:PackageDb,cookie:string,rawHost:string,rawId:string,input:{request_id:string;expected_context:string},clock:()=>Date){
  const host=uuid(rawHost),id=uuid(rawId),request=uuid(input.request_id);
  if(!/^[0-9a-f]{64}$/.test(input.expected_context))fail("invalid_request",400);
  const digest=commandFingerprint("manual_run",host,id,input.expected_context);
  return db.transaction().execute(async trx=>{
    await accessGate(trx);await packageLock(trx);const actor=await authorize(trx,cookie,clock);requireAdmin(actor);
    const replay=await mutationReplay(trx,actor.operatorId,request,digest) as {id:string;requested_at:string}|undefined;
    await completeAuthorization(trx,actor,clock());
    if(replay){const row=await trx.selectFrom("skill_manual_runs").selectAll().where("id","=",replay.id).executeTakeFirst();
      const scope=await currentScope(trx,host,id,actor.at);
      return row?summary(row,scope?.valid?scope.scope:null,actor.at):{...replay,phase:"failed" as const,reason:"detail_pruned",started_at:null,completed_at:null,run_id:null};}
    const {row,scope}=await enqueueManualRun(trx,{host,installation:id,operator:actor.operatorId,expectedContext:input.expected_context,at:actor.at});
    if(!row)fail("manual_queue_full",409);
    const result=summary(row,scope,actor.at);
    await recordMutation(trx,actor.operatorId,request,"manual_run",id,digest,actor.at,result);return result;
  });
}
