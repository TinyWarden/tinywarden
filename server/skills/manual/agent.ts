import { recordAgentContact } from "../../fleet/contact-evidence";
import type{Transaction,Selectable}from"kysely";
import type{Database}from"../../db/types";
import type{SkillAssignments}from"../../db/package-skill-types";
import{authorizeAgent}from"../../fleet/agent-authority";
import{fail}from"../../errors";
import{uuid}from"../../validation";
import{packageLock,type PackageDb}from"../catalog/package-commands";
import type{PackageRun}from"../results/package-input";
import{contextKey,currentScope,expireRequests,type ManualScope}from"./lifecycle";
function assignmentScope(a:Selectable<SkillAssignments>):ManualScope{return{...a};}
export async function manualDelivery(trx:Transaction<Database>,assignment:Selectable<SkillAssignments>,at:Date){
  const row=await trx.selectFrom("skill_manual_runs").selectAll().where("host_id","=",assignment.host_id).where("installation_id","=",assignment.installation_id)
    .where("phase","=","queued").where("queue_expires_at",">",at).executeTakeFirst();
  return row&&contextKey(row)===contextKey(assignmentScope(assignment))?{id:row.id,expires_at:row.queue_expires_at.toISOString()}:undefined;
}
export async function startManualRun(db:PackageDb,credential:string,input:{manual_request_id:unknown;assignment_id:unknown;run_id:unknown;run_sequence:unknown},clock:()=>Date){
  const id=uuid(input.manual_request_id),assignmentId=uuid(input.assignment_id),runId=uuid(input.run_id),sequence=input.run_sequence;
  if(typeof sequence!=="number"||!Number.isSafeInteger(sequence)||sequence<1)fail("invalid_request",400);
  return db.transaction().execute(async trx=>{
    await packageLock(trx);const authority = await authorizeAgent(trx,credential,clock);
    const {host,agent,now} = authority;await expireRequests(trx,host.id,now);
    const row=await trx.selectFrom("skill_manual_runs").selectAll().where("id","=",id).executeTakeFirst();
    const assignment=await trx.selectFrom("skill_assignments").selectAll().where("id","=",assignmentId).executeTakeFirst();
    if(!row||!assignment||row.host_id!==host.id||row.agent_id!==agent.id||row.generation!==agent.current_generation||
      contextKey(row)!==contextKey(assignmentScope(assignment))||assignment.valid_until<=now)fail("manual_request_invalid",409);
    await recordAgentContact(trx,authority);
    const current=await currentScope(trx,host.id,row.installation_id,now);
    if(!current?.valid||current.unavailable||contextKey(current.scope)!==contextKey(row))fail("manual_request_invalid",409);
    if(row.phase==="running"){
      if(row.run_id!==runId||row.assignment_id!==assignmentId||row.run_sequence!==String(sequence)||row.run_deadline!<=now)fail("manual_request_invalid",409);
      return{manual_request_id:id,assignment_id:assignmentId,run_id:runId,run_sequence:sequence,run_deadline:row.run_deadline!.toISOString()};}
    if(row.phase!=="queued"||row.queue_expires_at<=now)fail("manual_request_invalid",409);
    const used=await trx.selectFrom("skill_package_receipts").select("run_id").where(eb=>eb.or([eb("run_id","=",runId),eb.and([
      eb("agent_id","=",agent.id),eb("generation","=",agent.current_generation),eb("installation_id","=",row.installation_id),eb("run_sequence","=",String(sequence))])])).executeTakeFirst();
    const occupied=await trx.selectFrom("skill_manual_runs").select("id").where(eb=>eb.or([eb("run_id","=",runId),eb.and([
      eb("agent_id","=",agent.id),eb("generation","=",agent.current_generation),eb("installation_id","=",row.installation_id),eb("run_sequence","=",String(sequence))])])).executeTakeFirst();
    if(used||occupied)fail("idempotency_conflict",409);
    const deadline=new Date(Math.min(+now+90000,+assignment.valid_until));
    await trx.updateTable("skill_manual_runs").set({phase:"running",started_at:now,run_deadline:deadline,result_deadline:new Date(+now+120000),
      assignment_id:assignmentId,run_id:runId,run_sequence:sequence}).where("id","=",id).execute();
    return{manual_request_id:id,assignment_id:assignmentId,run_id:runId,run_sequence:sequence,run_deadline:deadline.toISOString()};
  });
}
export async function validateManualResult(trx:Transaction<Database>,input:PackageRun,a:Selectable<SkillAssignments>){
  if(!input.manual_request_id){
    const claimed=await trx.selectFrom("skill_manual_runs").select("id").where(eb=>eb.or([eb("run_id","=",input.run_id),eb.and([
      eb("agent_id","=",a.agent_id),eb("generation","=",a.generation),eb("installation_id","=",a.installation_id),eb("run_sequence","=",String(input.run_sequence))])])).executeTakeFirst();
    if(claimed)fail("manual_request_invalid",409);return;
  }
  const row=await trx.selectFrom("skill_manual_runs").selectAll().where("id","=",input.manual_request_id).executeTakeFirst();
  if(!row||contextKey(row)!==contextKey(assignmentScope(a))||row.run_id!==null&&
    (row.run_id!==input.run_id||row.assignment_id!==input.assignment_id||row.run_sequence!==String(input.run_sequence)))fail("manual_request_invalid",409);
  if(input.outcome==="observed"&&(!row.started_at||!row.run_deadline||new Date(input.started_at)<new Date(+row.started_at-5000)||
    new Date(input.started_at)>row.run_deadline||new Date(input.finished_at)>new Date(+row.run_deadline+5000)))fail("manual_request_invalid",409);
}
export async function completeManualResult(trx:Transaction<Database>,input:PackageRun,a:Selectable<SkillAssignments>,outcome:string,at:Date){
  if(!input.manual_request_id)return;
  await validateManualResult(trx,input,a);
  await expireRequests(trx,a.host_id,at);
  const row=await trx.selectFrom("skill_manual_runs").selectAll().where("id","=",input.manual_request_id).executeTakeFirstOrThrow();
  await trx.updateTable("skill_manual_runs").set({assignment_id:a.id,run_id:input.run_id,run_sequence:input.run_sequence,
    ...(row.phase==="queued"||row.phase==="running"?{phase:outcome==="observed"?"completed" as const:"failed" as const,reason:outcome,completed_at:at}:{})})
    .where("id","=",row.id).execute();
}
