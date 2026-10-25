import {randomUUID} from "node:crypto";
import {mkdtemp,cp,mkdir,writeFile,appendFile,chmod,readdir,rm} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {beforeEach,afterEach,describe,it,expect} from "vitest";
import {notificationFixture,url} from "../../p4b.fixture";
import {importSkillDirectory} from "../../../server/skills/catalog/package-install";
import {setPackageEnabled} from "../../../server/skills/catalog/package-controls";
import {fetchPackageAssignments} from "../../../server/skills/assignments/packages";
import {acceptPackageRun} from "../../../server/skills/results/package-runs";
import {readPackageResults} from "../../../server/skills/results/package-projection";
import {setPackagePolicy} from "../../../server/skills/settings/package-policies";
import {readResources} from "../../../server/skills/resources/inventory";
import {runHistory} from "../../../server/history/run";
import {readHistory} from "../../../server/history/reads";
import {withNotificationLock} from "../../../server/notifications/lock";
import {sampleFamily} from "../../../server/notifications/sampling";
import {resourceFeature} from "../../../lib/skills/resource-types";
import {controlPoll} from "../../../server/fleet/control";
import {fleetOperation} from "../../../server/fleet/commands";
import {sameStateScope} from "../../../server/skills/results/package-prepare";
import trim from "./fixtures/trim-clock.json";
import resources from "../resources/fixtures/contract.json";

describe("Reducer memory identity",()=>{
  it("survives an epoch change but not a generation, package, enablement or schema reset",()=>{
    const at=new Date("2026-10-23T00:00:00Z");
    const state={installation_id:"i",agent_id:"a",host_id:"h",generation:"1",monitoring_epoch:"1",
      content_sha256:"digest",enablement_version:"2",state_version:1,last_sequence:"8",
      finished_at:at,observation_id:"run",state:{history:"retained"},updated_at:at};
    const scope={agent:{current_generation:"1"},assignment:{content_sha256:"digest",enablement_version:"2",monitoring_epoch:"3"},artifact:{metadata:{manifest:{state_version:1}}}};
    expect(sameStateScope(state,scope)).toBe(true);
    expect(sameStateScope(undefined,scope)).toBe(false);
    for(const patch of [{generation:"2"},{content_sha256:"new"},{enablement_version:"3"},{state_version:2}]){
      expect(sameStateScope({...state,...patch},scope)).toBe(false);
    }
  });
});

async function cleanup(directory:string){
  await chmod(directory,0o700);
  for(const entry of await readdir(directory,{withFileTypes:true}))if(entry.isDirectory())await cleanup(path.join(directory,entry.name));
  await rm(directory,{recursive:true,force:true});
}

describe.skipIf(!url)("Platform evaluation clock through real SDK execution",()=>{
  let f:Awaited<ReturnType<typeof notificationFixture>>,root:string,store:string,id:string;
  beforeEach(async()=>{f=await notificationFixture();root=await mkdtemp(path.join(os.tmpdir(),"tw-clock-"));store=path.join(root,"store");});
  afterEach(async()=>{await f?.db.destroy();if(root)await cleanup(root);});
  async function install(sdk:1|2|"trim"){
    const directory=path.join(root,"source");
    if(sdk==="trim"){
      for(const [name,bytes] of Object.entries(trim.files)){
        await mkdir(path.dirname(path.join(directory,name)),{recursive:true});await writeFile(path.join(directory,name),bytes);
      }
    }else{
      await cp(path.resolve(sdk===1?"tests/skills/packages/fixtures/memory-pressure":"tests/skills/resources/fixtures/targets"),directory,{recursive:true});
      // Independent skills deliberately use ordinary strict time comparisons.
      await appendFile(path.join(directory,"skill.py"),`
original_evaluate = evaluate
def evaluate(context):
    assert context["now"] >= context["captured_at"]
    assert context["now"] >= context["received_at"]
    result = original_evaluate(context)
    result[0]["facts"].append({"key":"clock", "label_key":"${sdk===1?"total_label":"items"}", "kind":"time", "value":context["now"]})
    if ${sdk===1?"True":"False"}:
        result.append({**result[0], "from": context["now"] + 1000, "status":"critical"})
    return result
`);
    }
    const installed=await importSkillDirectory(f.db,f.session,{request_id:randomUUID(),directory,official:sdk==="trim"},f.clock,store);id=installed.installation_id;
    const artifact=await f.db.selectFrom("skill_packages").selectAll().where("content_sha256","=",installed.content_sha256).executeTakeFirstOrThrow();
    if(sdk==="trim")expect(installed.content_sha256).toBe(trim.content_sha256);
    await setPackageEnabled(f.db,f.session,id,{request_id:randomUUID(),expected_enablement_version:"1",content_sha256:installed.content_sha256,enabled:true,grants:artifact.metadata.manifest.capabilities},f.clock);
  }
  async function input(sequence:number,lead:number,observation:unknown,sdk:1|2=1){
    const assignment=(await fetchPackageAssignments(f.db,f.agentCredential,true,f.clock,undefined,sdk===2?[resourceFeature]:[])).assignments[0]!;
    return {protocol_version:sdk,run_id:randomUUID(),run_sequence:sequence,assignment_id:assignment.assignment_id!,
      started_at:new Date(+f.clock()+lead-1000).toISOString(),finished_at:new Date(+f.clock()+lead).toISOString(),
      outcome:"observed" as const,observation,...(sdk===2?{resources:resources.inventory}:{})};
  }
  const view=async()=>(await readPackageResults(f.db,f.session,f.hostId,f.clock)).skills[0]!;
  const memory={total_bytes:"10000",available_bytes:"4000",used_percent:60};

  it("handles lag, equality and allowed lead without delaying the first result or shifting absolute transitions",async()=>{
    await install(1);
    for(const [index,lead] of [-1000,0,403,5000].entries()){
      await f.advanceSeconds(10);
      const run=await input(index+1,lead,memory),received=+f.clock(),evaluated=Math.max(received,Date.parse(run.finished_at));
      const receipt=await acceptPackageRun(f.db,f.agentCredential,run,f.clock,store);
      expect(await acceptPackageRun(f.db,f.agentCredential,run,f.clock,store)).toEqual(receipt);
      const saved=await f.db.selectFrom("skill_observations").selectAll().where("id","=",run.run_id).executeTakeFirstOrThrow();
      expect(+saved.received_at).toBe(received);expect(+saved.finished_at).toBe(Date.parse(run.finished_at));expect(saved.observation).toEqual(memory);
      expect(+saved.evidence_expires_at).toBe(Math.min(received,Date.parse(run.finished_at))+900000);
      expect(saved.assessments.map(entry=>entry.from)).toEqual([received,evaluated+1000]);
      expect(saved.assessments[0]!.facts.find(fact=>fact.key==="clock")).toMatchObject({value:evaluated});
      expect((await view()).state).toBe("healthy");
      await f.advance(new Date(evaluated+999));expect((await view()).state).toBe("healthy");
      await f.advanceSeconds(.001);expect((await view()).state).toBe("critical");
    }
  });

  it("preserves delayed-run ordering, clock rejection, replay and evidence expiry",async()=>{
    await install(1);
    const latest=await input(2,5000,memory);await acceptPackageRun(f.db,f.agentCredential,latest,f.clock,store);
    const state=await f.db.selectFrom("skill_states").selectAll().executeTakeFirstOrThrow();
    const delayed=await input(1,0,memory);expect((await acceptPackageRun(f.db,f.agentCredential,delayed,f.clock,store)).current).toBe(false);
    expect(await f.db.selectFrom("skill_states").selectAll().executeTakeFirstOrThrow()).toEqual(state);
    await expect(acceptPackageRun(f.db,f.agentCredential,{...latest,observation:{...memory,used_percent:99}},f.clock,store)).rejects.toMatchObject({code:"idempotency_conflict"});
    await f.advanceSeconds(10);
    const invalid=await input(3,5001,memory);await acceptPackageRun(f.db,f.agentCredential,invalid,f.clock,store);
    expect((await view()).reason).toBe("clock_invalid");
    expect((await f.db.selectFrom("skill_observations").selectAll().where("id","=",invalid.run_id).executeTakeFirstOrThrow()).assessments).toEqual([]);
    await f.advanceSeconds(10);const fresh=await input(4,5000,memory);await acceptPackageRun(f.db,f.agentCredential,fresh,f.clock,store);
    // App rollback also invalidates its later contact receipt, before skill reads.
    const received=+f.clock();await f.advance(new Date(received-1));expect((await view()).reason).toBe("contact_unavailable");
    await f.advance(new Date(received));
    await f.advanceSeconds(900);expect((await view()).reason).toBe("reading_expired");
  });

  it("uses the same clock and receipt projection for SDK2 selected resources",async()=>{
    await install(2);
    await acceptPackageRun(f.db,f.agentCredential,await input(1,5000,{rows:[]},2),f.clock,store);
    const inventory=await readResources(f.db,f.session,f.hostId,id,"items",{},f.clock);
    await setPackagePolicy(f.db,f.session,f.hostId,id,{request_id:randomUUID(),expected_default_revision:"1",expected_policy_version:"0",overrides:{targets:["a"]},inventory_snapshots:{items:inventory.snapshot_id!}},f.clock,store);
    await f.advanceSeconds(10);
    const run=await input(2,5000,{rows:[{key:"a",status:"healthy"}]},2),received=+f.clock();
    await acceptPackageRun(f.db,f.agentCredential,run,f.clock,store);
    const result=await view();expect(result.state).toBe("healthy");
    expect(result.assessment).toMatchObject({from:received,subjects:[{key:"a",status:"healthy"}]});
    expect(result.assessment!.facts.find(fact=>fact.key==="clock")).toMatchObject({value:received+5000});
    expect((await readResources(f.db,f.session,f.hostId,id,"items",{},f.clock)).fresh).toBe(true);
    await f.advanceSeconds(180);
    expect((await readResources(f.db,f.session,f.hostId,id,"items",{},f.clock)).fresh).toBe(false);
    const latest=await readResources(f.db,f.session,f.hostId,id,"items",{},f.clock);
    await expect(setPackagePolicy(f.db,f.session,f.hostId,id,{request_id:randomUUID(),expected_default_revision:"1",expected_policy_version:"1",overrides:{targets:["a","b"]},inventory_snapshots:{items:latest.snapshot_id!}},f.clock,store)).rejects.toMatchObject({code:"settings_conflict"});
    const {pruneResourceBatch}=await import("../../../server/skills/resources/retention");
    expect((await pruneResourceBatch(f.db,new Date(received+1))).inventories).toBe(1);
  });

  it("runs trim with unchanged 1.1.6 collector code across reboot evidence and the reported fractional-second lead",async()=>{
    await install("trim");
    await f.advance(new Date(Math.floor(+f.clock()/1000)*1000+825));
    const observed=Math.floor(+f.clock()/1000),started=observed-3*86400;
    const observation={problem:"none",observed_at:observed,reclamation_verified:false,
      timer:{load_state:"loaded",active_state:"active",unit_file_state:"enabled",condition:{passed:true,checked_at:observed-10},last_trigger:started,next_elapse:observed+7*86400},
      service:{load_state:"loaded",active_state:"inactive",result:"success",exit_kind:1,exit_status:0,condition:{passed:true,checked_at:started},started_at:started,finished_at:started+1}};
    await acceptPackageRun(f.db,f.agentCredential,await input(1,0,observation),f.clock,store);
    const original=await f.db.selectFrom("skill_states").select("state").executeTakeFirstOrThrow();
    await f.advanceSeconds(3600);
    const reboot={...observation,observed_at:Math.floor((+f.clock()+403)/1000),service:{load_state:"loaded",active_state:"inactive",result:"success",exit_kind:0,exit_status:0,condition:{}}};
    const run=await input(2,403,reboot);await acceptPackageRun(f.db,f.agentCredential,run,f.clock,store);
    const result=await view();expect(result.state).toBe("healthy");expect(result.assessment!.from).toBe(+f.clock());
    expect(result.assessment!.reason.key).toBe("fstrim_observed_success");
    expect(result.assessment!.facts.find(fact=>fact.key==="trim_completed_at")).toMatchObject({value:(started+1)*1000});
    const retained=await f.db.selectFrom("skill_states").select("state").executeTakeFirstOrThrow();
    expect((retained.state as Record<string,unknown>).last_execution).toEqual((original.state as Record<string,unknown>).last_execution);
    expect(result.metadata.content_sha256).toBe(trim.content_sha256);
    // Retained success cannot conceal actual uncertainty or a disabled timer.
    await f.advanceSeconds(10);await acceptPackageRun(f.db,f.agentCredential,await input(3,403,{problem:"clock_uncertain"}),f.clock,store);
    expect((await view()).state).toBe("unknown");
    await f.advanceSeconds(10);
    await acceptPackageRun(f.db,f.agentCredential,await input(4,403,{...reboot,observed_at:Math.floor((+f.clock()+403)/1000),timer:{...reboot.timer,unit_file_state:"disabled"}}),f.clock,store);
    expect((await view()).state).toBe("warning");
    await f.advanceSeconds(10);
    await acceptPackageRun(f.db,f.agentCredential,await input(5,403,{...observation,observed_at:Math.floor((+f.clock()+403)/1000),service:{...observation.service,active_state:"failed",result:"exit-code",exit_status:1}}),f.clock,store);
    expect((await view()).assessment!.reason.key).toBe("fstrim_service_failed");
  });

  it("retains canonical trim memory across pause/resume without reviving old evidence",async()=>{
    await install("trim");
    const at=Math.floor(+f.clock()/1000),completed=at-86400;
    const observed={problem:"none",observed_at:at,reclamation_verified:false,
      timer:{load_state:"loaded",active_state:"active",unit_file_state:"enabled",condition:{passed:true,checked_at:at-10},last_trigger:completed-1,next_elapse:at+7*86400},
      service:{load_state:"loaded",active_state:"inactive",result:"success",exit_kind:1,exit_status:0,condition:{passed:true,checked_at:completed-1},started_at:completed-1,finished_at:completed}};
    await acceptPackageRun(f.db,f.agentCredential,await input(10,0,observed),f.clock,store);
    const original=await f.db.selectFrom("skill_states").selectAll().executeTakeFirstOrThrow();
    const late=await input(11,0,observed);
    await controlPoll(f.db,f.agentCredential,{applied:null},f.clock);
    const change=async(kind:"pause"|"resume",revision:string)=>fleetOperation(f.db,f.session,{request_id:randomUUID(),kind,targets:[{id:f.hostId,revision}],values:{}},f.clock);
    await change("pause","1");
    expect((await view()).state).toBe("unknown");
    expect((await acceptPackageRun(f.db,f.agentCredential,late,f.clock,store)).current).toBe(false);
    await f.advanceSeconds(60);await change("resume","2");
    expect((await view()).state).toBe("unknown");
    expect(await acceptPackageRun(f.db,f.agentCredential,late,f.clock,store)).toMatchObject({current:false});
    // A new assignment does not reset same-generation sequence or capture ordering.
    for(const run of [await input(9,0,observed),await input(12,-61000,observed)]){
      expect((await acceptPackageRun(f.db,f.agentCredential,run,f.clock,store)).current).toBe(false);
    }
    expect(await f.db.selectFrom("skill_states").selectAll().executeTakeFirstOrThrow()).toEqual(original);
    const failed={...await input(13,0,null),outcome:"execution_failed" as const};
    const receipt=await acceptPackageRun(f.db,f.agentCredential,failed,f.clock,store);
    expect(await acceptPackageRun(f.db,f.agentCredential,failed,f.clock,store)).toEqual(receipt);
    expect((await view()).state).toBe("unknown");
    expect((await f.db.selectFrom("skill_states").select("state").executeTakeFirstOrThrow()).state).toEqual(original.state);
    await f.advanceSeconds(1);
    await acceptPackageRun(f.db,f.agentCredential,await input(14,0,{problem:"clock_uncertain"}),f.clock,store);
    expect((await view()).state).toBe("unknown");
    await f.advanceSeconds(1);
    const reboot={...observed,observed_at:Math.floor(+f.clock()/1000),service:{load_state:"loaded",active_state:"inactive",result:"success",exit_kind:0,exit_status:0,condition:{}}};
    await acceptPackageRun(f.db,f.agentCredential,await input(15,0,reboot),f.clock,store);
    const fresh=await view();expect(fresh.state).toBe("healthy");
    expect(fresh.metadata.content_sha256).toBe(trim.content_sha256);
    expect(fresh.assessment!.facts.find(fact=>fact.key==="trim_completed_at")).toMatchObject({value:completed*1000});
    // Retention still bounds memory; absence cannot be replaced by a timer trigger.
    await f.advanceSeconds(91*86400);
    const later=Math.floor(+f.clock()/1000);
    await acceptPackageRun(f.db,f.agentCredential,await input(16,0,{...reboot,observed_at:later,timer:{...reboot.timer,next_elapse:later+86400}}),f.clock,store);
    expect((await view()).assessment!.facts.some(fact=>fact.key==="trim_completed_at")).toBe(false);
  });

  it("keeps overdue trim expectations as memory and reassesses them using fresh evidence",async()=>{
    await install("trim");
    const at=Math.floor(+f.clock()/1000);
    const observation={problem:"none",observed_at:at,reclamation_verified:false,
      timer:{load_state:"loaded",active_state:"active",unit_file_state:"enabled",condition:{passed:true,checked_at:at-10},last_trigger:at-86400,next_elapse:at+60},
      service:{load_state:"loaded",active_state:"inactive",result:"success",exit_kind:0,exit_status:0,condition:{}}};
    await acceptPackageRun(f.db,f.agentCredential,await input(1,0,observation),f.clock,store);
    await controlPoll(f.db,f.agentCredential,{applied:null},f.clock);
    await fleetOperation(f.db,f.session,{request_id:randomUUID(),kind:"pause",targets:[{id:f.hostId,revision:"1"}],values:{}},f.clock);
    await f.advanceSeconds(2*86400);
    await fleetOperation(f.db,f.session,{request_id:randomUUID(),kind:"resume",targets:[{id:f.hostId,revision:"2"}],values:{}},f.clock);
    expect((await view()).state).toBe("unknown");
    await acceptPackageRun(f.db,f.agentCredential,await input(2,0,{...observation,observed_at:Math.floor(+f.clock()/1000),timer:{...observation.timer,next_elapse:Math.floor(+f.clock()/1000)+86400}}),f.clock,store);
    expect((await view()).assessment!.reason.key).toBe("fstrim_result_overdue");
    expect((await view()).assessment!.facts.some(fact=>fact.key==="trim_completed_at")).toBe(false);
  });

  it("exposes accepted results to History and notifications at receipt",async()=>{
    await install(1);
    await acceptPackageRun(f.db,f.agentCredential,await input(1,5000,memory),f.clock,store);
    expect((await runHistory(f.db,"tinywarden_test_p1b",f.clock)).outcome).toBe("completed");
    await withNotificationLock(f.db,"tinywarden_test_p1b",db=>sampleFamily(db,f.routeId,f.settings,f.hostId,"packages",f.clock));
    const cursor=await f.db.selectFrom("notification_cursors").selectAll().where("subject_key","=","example/memory-pressure").executeTakeFirstOrThrow();
    expect(cursor.last_state).toBe("healthy");
    await f.advanceSeconds(6);
    const control=await f.db.selectFrom("history_control").selectAll().executeTakeFirstOrThrow();
    const {captureHistoryFamily}=await import("../../../server/history/sampling");
    await captureHistoryFamily(f.db,control.epoch,f.hostId,"packages",f.clock);
    const history=await readHistory(f.db,f.session,{limit:25,skills:["example/memory-pressure"]},f.clock);
    expect(history.events.some(event=>event.from_state==="healthy"&&event.to_state==="critical")).toBe(true);
    await withNotificationLock(f.db,"tinywarden_test_p1b",db=>sampleFamily(db,f.routeId,f.settings,f.hostId,"packages",f.clock));
    expect((await f.db.selectFrom("notification_cursors").selectAll().where("id","=",cursor.id).executeTakeFirstOrThrow()).last_state).toBe("critical");
  });
});
