import{randomUUID}from"node:crypto";
import type{Transaction}from"kysely";
import type{Database}from"../../db/types";
import{authorize,completeAuthorization}from"../../access/session";
import{uuid}from"../../validation";
import{fail}from"../../errors";
import{packageLock,mutationReplay,recordMutation,commandFingerprint,type PackageDb}from"../catalog/package-commands";
import{currentScope,contextKey,expireRequests,summary,type ManualScope}from"./lifecycle";
import type{PackageProjection}from"../results/package-projection";
export async function manualFeedback(trx:Transaction<Database>,host:string,skills:PackageProjection[],at:Date){
  const machine=await trx.selectFrom("hosts").select("architecture").where("id","=",host).executeTakeFirstOrThrow();
  const runtime=await trx.selectFrom("skill_runtime_hosts").selectAll().where("host_id","=",host).executeTakeFirst();
  const latest=await trx.selectFrom("skill_manual_runs").selectAll().distinctOn("installation_id").where("host_id","=",host)
    .orderBy("installation_id").orderBy("requested_at","desc").orderBy("id","desc").limit(100).execute();
  return skills.map(skill=>{
    const scope:ManualScope|null=skill.agent_id&&skill.generation?{host_id:host,agent_id:skill.agent_id,generation:skill.generation,
      installation_id:skill.installation_id,content_sha256:skill.content_sha256,enablement_version:skill.enablement_version,
      settings_revision:skill.source_revision,policy_version:skill.policy_version}:null;
    const unavailable_reason=!skill.enabled?"disabled":!skill.eligible||!skill.contact_current?"contact_unavailable":
      !runtime?.ready||runtime.generation!==skill.generation||!skill.metadata.manifest.compatibility.architectures.includes(machine.architecture)?"runtime_unavailable":!runtime.manual_runs_supported?"agent_upgrade_required":null;
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
    await packageLock(trx);const actor=await authorize(trx,cookie,clock);
    const replay=await mutationReplay(trx,actor.operatorId,request,digest) as {id:string;requested_at:string}|undefined;
    await completeAuthorization(trx,actor,clock());
    if(replay){const row=await trx.selectFrom("skill_manual_runs").selectAll().where("id","=",replay.id).executeTakeFirst();
      const scope=await currentScope(trx,host,id,actor.at);
      return row?summary(row,scope?.valid?scope.scope:null,actor.at):{...replay,phase:"failed" as const,reason:"detail_pruned",started_at:null,completed_at:null,run_id:null};}
    await expireRequests(trx,host,actor.at);
    const current=await currentScope(trx,host,id,actor.at);
    if(!current)fail("not_found",404);
    if(contextKey(current.scope)!==input.expected_context)fail("scope_changed",409);
    if(current.unavailable)fail(current.unavailable,409);
    let row=await trx.selectFrom("skill_manual_runs").selectAll().where("host_id","=",host).where("installation_id","=",id)
      .where("phase","in",["queued","running"]).executeTakeFirst();
    if(!row){const count=await trx.selectFrom("skill_manual_runs").select(eb=>eb.fn.countAll<string>().as("count")).where("host_id","=",host)
        .where("phase","in",["queued","running"]).executeTakeFirstOrThrow();if(Number(count.count)>=8)fail("manual_queue_full",409);
      row=await trx.insertInto("skill_manual_runs").values({...current.scope,id:randomUUID(),operator_id:actor.operatorId,
        requested_at:actor.at,queue_expires_at:new Date(+actor.at+300000),phase:"queued",started_at:null,run_deadline:null,
        result_deadline:null,completed_at:null,reason:null,assignment_id:null,run_id:null,run_sequence:null}).returningAll().executeTakeFirstOrThrow();}
    const result=summary(row,current.scope,actor.at);
    await recordMutation(trx,actor.operatorId,request,"manual_run",id,digest,actor.at,result);return result;
  });
}
