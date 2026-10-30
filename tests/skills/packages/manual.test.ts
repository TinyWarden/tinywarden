import {enqueueManualRun} from "../../../server/skills/manual/queue";
import {setTimeout as delay} from "node:timers/promises";
import {waitForAgentWork} from "../../../server/maintenance/work-wait";
import{operatorManualRun}from"../../../server/http/manual-handlers";
import{sessionCookie}from"../../../server/access/session";
import{randomUUID}from"node:crypto";
import{mkdtemp,chmod,readdir,rm}from"node:fs/promises";
import path from"node:path";import os from"node:os";
import{beforeEach,afterEach,describe,it,expect}from"vitest";
import{notificationFixture,url}from"../../p4b.fixture";
import{importSkillDirectory}from"../../../server/skills/catalog/package-install";
import{setPackageEnabled}from"../../../server/skills/catalog/package-controls";
import{updatePackageDefaults}from"../../../server/skills/settings/package-defaults";
import{fetchPackageAssignments}from"../../../server/skills/assignments/packages";
import{readPackageResults}from"../../../server/skills/results/package-projection";
import{requestManualRun}from"../../../server/skills/manual/operator";
import{startManualRun}from"../../../server/skills/manual/agent";
import{acceptPackageRun}from"../../../server/skills/results/package-runs";
import{packageRunDigest}from"../../../server/skills/results/package-input";
import{commandFingerprint}from"../../../server/skills/catalog/package-commands";
import{pruneManualBatch}from"../../../server/skills/manual/retention";
import{manualCapability}from"../../../server/skills/manual/lifecycle";
async function clean(root:string){await chmod(root,0o700);for(const d of await readdir(root,{withFileTypes:true}))if(d.isDirectory())await clean(path.join(root,d.name));await rm(root,{recursive:true,force:true});}
describe.skipIf(!url)("S6 durable manual requests",()=>{
  let f:Awaited<ReturnType<typeof notificationFixture>>,store:string,id:string,digest:string;
  beforeEach(async()=>{f=await notificationFixture();store=await mkdtemp(path.join(os.tmpdir(),"tw-manual-"));
    const installed=await importSkillDirectory(f.db,f.session,{request_id:randomUUID(),directory:path.join(process.cwd(),"tests/skills/packages/fixtures/memory-pressure")},f.clock,store);
    id=installed.installation_id;digest=installed.content_sha256;const p=await f.db.selectFrom("skill_packages").selectAll().where("content_sha256","=",digest).executeTakeFirstOrThrow();
    await setPackageEnabled(f.db,f.session,id,{request_id:randomUUID(),expected_enablement_version:"1",content_sha256:digest,enabled:true,grants:p.metadata.manifest.capabilities},f.clock);
  });
  afterEach(async()=>{await f?.db.destroy();if(store)await clean(store);});
  const delivery=()=>fetchPackageAssignments(f.db,f.agentCredential,true,f.clock,manualCapability);
  const context=async()=>{await delivery();return(await readPackageResults(f.db,f.session,f.hostId,f.clock)).skills.find(s=>s.installation_id===id)!.manual_run.expected_context!;};
  const command=async()=>({request_id:randomUUID(),expected_context:await context()});
  const request=(input:{request_id:string;expected_context:string})=>requestManualRun(f.db,f.session,f.hostId,id,input,f.clock);
  const run=(assignment:string,sequence:number,manual:string)=>({manual_request_id:manual,run_id:randomUUID(),run_sequence:sequence,assignment_id:assignment,
    started_at:f.clock().toISOString(),finished_at:f.clock().toISOString(),outcome:"observed" as const,observation:{total_bytes:"10000",available_bytes:"1000",used_percent:90}});
  it("wakes monitoring independently of maintenance without claiming work or changing contact",async()=>{
    const input=await command(),controller=new AbortController();
    const before=await f.db.selectFrom('agent_credentials').select(['last_contact_at','accepted_at']).where('agent_id','=',f.agentId).execute();
    const hint={schema_version:1,wait_seconds:3,cursor:null,lane:'monitoring'};
    const started=performance.now(),waiting=waitForAgentWork(f.db,f.agentCredential,hint,f.clock,controller.signal);
    await delay(50);
    expect((await waitForAgentWork(f.db,f.agentCredential,{schema_version:1,wait_seconds:0,cursor:null},f.clock,new AbortController().signal)).available).toBe(false);
    await expect(waitForAgentWork(f.db,f.agentCredential,hint,f.clock,new AbortController().signal)).rejects.toMatchObject({code:'temporarily_unavailable'});
    const queued=await request(input),reply=await waiting;
    expect(reply.available).toBe(true);expect(performance.now()-started).toBeLessThan(2500);
    expect(await f.db.selectFrom('skill_manual_runs').select(['phase','run_id','assignment_id']).where('id','=',queued.id).executeTakeFirst()).toEqual({phase:'queued',run_id:null,assignment_id:null});
    expect(await f.db.selectFrom('agent_credentials').select(['last_contact_at','accepted_at']).where('agent_id','=',f.agentId).execute()).toEqual(before);
    expect((await waitForAgentWork(f.db,f.agentCredential,{...hint,wait_seconds:0,cursor:reply.cursor},f.clock,controller.signal)).available).toBe(false);
    // Replaced generations and expired requests do not wake the current agent.
    const credential=await f.db.selectFrom('agent_credentials').selectAll().where('agent_id','=',f.agentId).executeTakeFirstOrThrow();
    await f.db.insertInto('agent_credentials').values({...credential,id:randomUUID(),generation:'2',secret_digest:Buffer.alloc(32,42),revoked_at:f.clock()}).execute();
    await f.db.updateTable('skill_manual_runs').set({generation:'2'}).where('id','=',queued.id).execute();
    expect((await waitForAgentWork(f.db,f.agentCredential,{...hint,wait_seconds:0},f.clock,controller.signal)).available).toBe(false);
    await f.db.updateTable('skill_manual_runs').set({generation:'1'}).where('id','=',queued.id).execute();
    expect((await waitForAgentWork(f.db,f.agentCredential,{...hint,wait_seconds:0},()=>new Date(+f.clock()+300001),controller.signal)).available).toBe(false);
  });
  it("validates the optional monitoring lane and rechecks revoked authority",async()=>{
    const hint={schema_version:1,wait_seconds:0,cursor:null};
    for(const lane of [null,'all','unknown',{},['monitoring']])await expect(waitForAgentWork(f.db,f.agentCredential,{...hint,lane},f.clock,new AbortController().signal)).rejects.toMatchObject({code:'invalid_request'});
    const waiting=waitForAgentWork(f.db,f.agentCredential,{...hint,wait_seconds:1,lane:'monitoring'},f.clock,new AbortController().signal);
    const denied=expect(waiting).rejects.toMatchObject({code:'unauthorized'});
    await delay(50);await f.db.updateTable('agent_credentials').set({revoked_at:f.clock()}).where('agent_id','=',f.agentId).execute();
    await denied;
  });
  it("negotiates old wire, joins concurrent clicks and retains idempotency after pruning",async()=>{
    const old=await fetchPackageAssignments(f.db,f.agentCredential,true,f.clock);expect(old).not.toHaveProperty("manual_runs_supported");
    expect(old.assignments[0]).not.toHaveProperty("manual_request");
    const feedback=(await readPackageResults(f.db,f.session,f.hostId,f.clock)).skills[0]!.manual_run;
    expect(feedback.can_request).toBe(false);expect(feedback.unavailable_reason).toBe("agent_upgrade_required");
    const a=await command(),b={...a,request_id:randomUUID()},results=await Promise.all([request(a),request(a),request(b)]);
    expect(new Set(results.map(r=>r.id)).size).toBe(1);expect(await f.db.selectFrom("skill_manual_runs").selectAll().execute()).toHaveLength(1);
    await expect(request({...a,expected_context:"a".repeat(64)})).rejects.toMatchObject({code:"idempotency_conflict"});
    const wire=await delivery();expect(wire.manual_runs_supported).toBe(true);expect(wire.assignments[0]!.manual_request!.id).toBe(results[0]!.id);
    await pruneManualBatch(f.db,new Date(+f.clock()+1));const replay=await request(a);expect(replay.id).toBe(results[0]!.id);expect(replay.reason).toBe("detail_pruned");
    expect(await f.db.selectFrom("skill_manual_runs").selectAll().execute()).toHaveLength(0);
  });
  it("fences start identity, accepts one observed warning and exact result replay",async()=>{
    const result=await request(await command()),assignment=(await delivery()).assignments[0]!,input=run(assignment.assignment_id!,1,result.id);
    const claim={manual_request_id:result.id,assignment_id:input.assignment_id,run_id:input.run_id,run_sequence:input.run_sequence};
    const started=await startManualRun(f.db,f.agentCredential,claim,f.clock);expect(await startManualRun(f.db,f.agentCredential,claim,f.clock)).toEqual(started);
    await expect(startManualRun(f.db,f.agentCredential,{...claim,run_id:randomUUID()},f.clock)).rejects.toMatchObject({code:"manual_request_invalid"});
    const{manual_request_id:omitted,...ordinary}=input;expect(omitted).toBe(result.id);
    expect(packageRunDigest(ordinary)).toEqual(commandFingerprint("run",ordinary.run_id,ordinary.run_sequence,ordinary.assignment_id,ordinary.started_at,ordinary.finished_at,ordinary.outcome,ordinary.observation));
    await expect(acceptPackageRun(f.db,f.agentCredential,ordinary,f.clock,store)).rejects.toMatchObject({code:"manual_request_invalid"});
    const receipt=await acceptPackageRun(f.db,f.agentCredential,input,f.clock,store);expect(await acceptPackageRun(f.db,f.agentCredential,input,f.clock,store)).toEqual(receipt);
    const view=(await readPackageResults(f.db,f.session,f.hostId,f.clock)).skills[0]!;expect(view.state).toBe("warning");expect(view.manual_run.latest!.phase).toBe("completed");
    expect(await f.db.selectFrom("skill_observations").selectAll().execute()).toHaveLength(1);
  });
  it("expires queues, rejects changed scope and preserves timed-out status for late readings",async()=>{
    const first=await request(await command());await f.advanceSeconds(301);
    expect((await readPackageResults(f.db,f.session,f.hostId,f.clock)).skills[0]!.manual_run.latest!.reason).toBe("queue_expired");
    const assignment=(await delivery()).assignments[0]!;const input=run(assignment.assignment_id!,1,first.id);
    await expect(startManualRun(f.db,f.agentCredential,{manual_request_id:first.id,assignment_id:input.assignment_id,run_id:input.run_id,run_sequence:1},f.clock)).rejects.toMatchObject({code:"manual_request_invalid"});
    const second=await request(await command()),entry=(await delivery()).assignments[0]!,late=run(entry.assignment_id!,2,second.id);
    await startManualRun(f.db,f.agentCredential,{manual_request_id:second.id,assignment_id:late.assignment_id,run_id:late.run_id,run_sequence:2},f.clock);
    await f.advanceSeconds(121);await delivery();await acceptPackageRun(f.db,f.agentCredential,late,f.clock,store);
    const view=(await readPackageResults(f.db,f.session,f.hostId,f.clock)).skills[0]!;expect(view.manual_run.latest!.phase).toBe("failed");expect(view.manual_run.latest!.reason).toBe("result_timeout");expect(view.state).toBe("warning");
    const third=await request(await command());const current=await f.db.selectFrom("skill_installations").selectAll().where("id","=",id).executeTakeFirstOrThrow();
    await updatePackageDefaults(f.db,f.session,id,{request_id:randomUUID(),expected_revision:current.settings_revision,settings:{...current.defaults,interval_seconds:600}},f.clock,store);
    expect((await readPackageResults(f.db,f.session,f.hostId,f.clock)).skills[0]!.manual_run.latest!.reason).toBe("scope_changed");
    await expect(startManualRun(f.db,f.agentCredential,{manual_request_id:third.id,assignment_id:late.assignment_id,run_id:randomUUID(),run_sequence:3},f.clock)).rejects.toMatchObject({code:"manual_request_invalid"});
  });
  it("enforces same-origin authorization and refuses disabled or cross-host claims",async()=>{
    const c=await command(),address=`${f.ctx.config.origin}/api/v2/operator/hosts/${f.hostId}/skills/${id}/run`;
    const headers={"Content-Type":"application/json",cookie:`${sessionCookie}=${f.session}`,origin:f.ctx.config.origin};
    const denied=await operatorManualRun(new Request(address,{method:"POST",headers,body:JSON.stringify({schema_version:1,...c})}),f.hostId,id,f.ctx);
    expect(denied.status).toBe(403);
    const accepted=await operatorManualRun(new Request(address,{method:"POST",headers:{...headers,"X-TinyWarden-Request":"1"},body:JSON.stringify({schema_version:1,...c})}),f.hostId,id,f.ctx);
    expect(accepted.status).toBe(200);const result=(await accepted.json()).result,a=(await delivery()).assignments[0]!;
    await expect(requestManualRun(f.db,f.session,randomUUID(),id,{...c,request_id:randomUUID()},f.clock)).rejects.toMatchObject({code:"not_found"});
    await f.db.updateTable("skill_installations").set({enabled:false}).where("id","=",id).execute();
    await expect(startManualRun(f.db,f.agentCredential,{manual_request_id:result.id,assignment_id:a.assignment_id!,run_id:randomUUID(),run_sequence:1},f.clock)).rejects.toMatchObject({code:"manual_request_invalid"});
    expect((await readPackageResults(f.db,f.session,f.hostId,f.clock)).skills[0]!.manual_run.latest!.reason).toBe("scope_changed");
  });
  it("closes interrupted allocation without granting permission to report observed success",async()=>{
    const result=await request(await command()),a=(await delivery()).assignments[0]!,input=run(a.assignment_id!,1,result.id);
    await expect(acceptPackageRun(f.db,f.agentCredential,input,f.clock,store)).rejects.toMatchObject({code:"manual_request_invalid"});
    const failed={...input,outcome:"execution_failed" as const,observation:null};await acceptPackageRun(f.db,f.agentCredential,failed,f.clock,store);
    const row=await f.db.selectFrom("skill_manual_runs").selectAll().where("id","=",result.id).executeTakeFirstOrThrow();expect(row.phase).toBe("failed");expect(row.run_id).toBe(input.run_id);
    await expect(acceptPackageRun(f.db,f.agentCredential,{...failed,run_id:randomUUID(),run_sequence:2},f.clock,store)).rejects.toMatchObject({code:"manual_request_invalid"});
  });
  it("consumes obsolete monitoring epochs without recreating package evidence or manual work",async()=>{
    const old=(await delivery()).assignments[0]!;
    const input={run_id:randomUUID(),run_sequence:1,assignment_id:old.assignment_id!,started_at:f.clock().toISOString(),finished_at:f.clock().toISOString(),outcome:"observed" as const,observation:{total_bytes:"10000",available_bytes:"1000",used_percent:90}};
    await f.db.updateTable("hosts").set({lifecycle:"paused",monitoring_epoch:"2",monitoring_changed_at:f.clock()}).where("id","=",f.hostId).execute();
    const receipt=await acceptPackageRun(f.db,f.agentCredential,input,f.clock,store);
    expect(receipt.current).toBe(false);
    expect(await f.db.selectFrom("skill_observations").select("id").execute()).toHaveLength(0);
    expect(await f.db.selectFrom("skill_states").select("agent_id").execute()).toHaveLength(0);
    expect(await f.db.selectFrom("skill_metric_frames").select("observation_id").execute()).toHaveLength(0);
    await f.db.updateTable("hosts").set({lifecycle:"active",monitoring_epoch:"3"}).where("id","=",f.hostId).execute();
    const fresh=(await delivery()).assignments[0]!;expect(fresh.assignment_id).not.toBe(old.assignment_id);
    expect(await acceptPackageRun(f.db,f.agentCredential,input,f.clock,store)).toEqual(receipt);
    await expect(acceptPackageRun(f.db,f.agentCredential,{...input,observation:{...input.observation,used_percent:89}},f.clock,store)).rejects.toMatchObject({code:"idempotency_conflict"});
  });

  it("permanently purges generic package results and metrics while preserving shared installations",async()=>{
    const a=(await delivery()).assignments[0]!;
    await acceptPackageRun(f.db,f.agentCredential,{run_id:randomUUID(),run_sequence:1,assignment_id:a.assignment_id!,started_at:f.clock().toISOString(),finished_at:f.clock().toISOString(),outcome:"observed",observation:{total_bytes:"10000",available_bytes:"1000",used_percent:90}},f.clock,store);
    const {removalPreview,fleetOperation}=await import("../../../server/fleet/commands");const {purgeNextBatch}=await import("../../../server/fleet/purge");
    const targets=[{id:f.hostId,revision:"1"}],preview=await removalPreview(f.db,f.session,"delete",targets,f.clock);
    await fleetOperation(f.db,f.session,{request_id:randomUUID(),kind:"delete",targets,values:{preview:preview.preview}},f.clock);
    for(let n=0;n<100;n++){const job=await f.db.selectFrom("fleet_purge_jobs").selectAll().where("host_id","=",f.hostId).executeTakeFirstOrThrow();expect(job.state,JSON.stringify(job)).not.toBe("failed");if(job.state==="completed")break;await purgeNextBatch(f.db,f.clock);}
    expect(await f.db.selectFrom("hosts").select("id").where("id","=",f.hostId).execute()).toHaveLength(0);
    expect(await f.db.selectFrom("skill_observations").select("id").execute()).toHaveLength(0);expect(await f.db.selectFrom("skill_metric_samples").select("observation_id").execute()).toHaveLength(0);
    expect(await f.db.selectFrom("skill_packages").select("content_sha256").execute()).toHaveLength(1);expect(await f.db.selectFrom("skill_installations").select("id").execute()).toHaveLength(1);
  });

  it("keeps earlier operator work separate from a fresh internal verification request",async()=>{
    const input=await command(),first=await request(input);
    await f.advanceSeconds(1);const boundary=f.clock();
    const actor=await f.db.selectFrom("operators").select("id").where("role","=","admin").executeTakeFirstOrThrow();
    const queue=()=>f.db.transaction().execute(trx=>enqueueManualRun(trx,{host:f.hostId,installation:id,operator:actor.id,expectedContext:input.expected_context,at:f.clock(),notBefore:boundary}));
    expect((await queue()).row).toBeNull();
    const assignment=(await delivery()).assignments[0]!,reading=run(assignment.assignment_id!,1,first.id);
    await startManualRun(f.db,f.agentCredential,{manual_request_id:first.id,assignment_id:reading.assignment_id,run_id:reading.run_id,run_sequence:reading.run_sequence},f.clock);
    await acceptPackageRun(f.db,f.agentCredential,reading,f.clock,store);
    const fresh=await queue();expect(fresh.row?.id).not.toBe(first.id);
    expect(fresh.row?.phase).toBe("queued");expect(fresh.row!.requested_at>=boundary).toBe(true);
    expect((await queue()).row?.id).toBe(fresh.row!.id);
  });

});
