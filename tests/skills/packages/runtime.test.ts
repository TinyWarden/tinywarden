import { randomUUID } from "node:crypto";
import { mkdtemp, chmod, readdir, rm, cp, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { notificationFixture, url } from "../../p4b.fixture";
import { importSkillDirectory } from "../../../server/skills/catalog/package-install";
import { setPackageEnabled } from "../../../server/skills/catalog/package-controls";
import { updatePackageDefaults } from "../../../server/skills/settings/package-defaults";
import { setPackagePolicy } from "../../../server/skills/settings/package-policies";
import { fetchPackageAssignments } from "../../../server/skills/assignments/packages";
import { acceptPackageRun } from "../../../server/skills/results/package-runs";
import { readPackageResults } from "../../../server/skills/results/package-projection";
import { captureHistoryFamily } from "../../../server/history/sampling";
import { runHistory } from "../../../server/history/run";
import { readHistory } from "../../../server/history/reads";
import { withNotificationLock } from "../../../server/notifications/lock";
import { sampleFamily } from "../../../server/notifications/sampling";
import { PackageFacts } from "../../../components/skills/package-facts";
import { selectPackageVersion } from "../../../server/skills/catalog/package-version";
import { importLegacySkills } from "../../../server/skills/catalog/legacy-import";
import { pruneExpiredObservations } from "../../../server/maintenance/retention";
import { sample } from "../../p4a.fixture";
import pinnedOfficial from "./fixtures/official-packages.json";

async function removeStore(root: string) {
  await chmod(root,0o700);
  for (const entry of await readdir(root,{withFileTypes:true})) if (entry.isDirectory()) await removeStore(path.join(root,entry.name));
  await rm(root,{recursive:true,force:true});
}
describe.skipIf(!url)("S2 generic package engine on the existing PostgreSQL instance", () => {
  let f: Awaited<ReturnType<typeof notificationFixture>>, root: string, store: string;
  beforeEach(async () => { f=await notificationFixture(); root=await mkdtemp(path.join(os.tmpdir(),"tw-s2-"));store=path.join(root,"store"); });
  afterEach(async () => { await f?.db.destroy(); if(root) await removeStore(root); });
  const source=path.join(process.cwd(),"tests/skills/packages/fixtures/memory-pressure");
  const install=async () => {
    const imported=await importSkillDirectory(f.db,f.session,{request_id:randomUUID(),directory:source},f.clock,store);
    const artifact=await f.db.selectFrom("skill_packages").selectAll().where("content_sha256","=",imported.content_sha256).executeTakeFirstOrThrow();
    expect(imported.enabled).toBe(false);
    await setPackageEnabled(f.db,f.session,imported.installation_id,{request_id:randomUUID(),expected_enablement_version:"1",content_sha256:imported.content_sha256,enabled:true,grants:artifact.metadata.manifest.capabilities},f.clock);
    return {...imported,artifact};
  };
  const fetch=() => fetchPackageAssignments(f.db,f.agentCredential,true,f.clock);
  const run=(assignment:string,sequence:number,percent=90) => ({run_id:randomUUID(),run_sequence:sequence,assignment_id:assignment,
    started_at:new Date(f.clock().getTime()-1000).toISOString(),finished_at:f.clock().toISOString(),outcome:"observed" as const,
    observation:{total_bytes:"10000",available_bytes:String(10000-percent*100),used_percent:percent}});

  it("converts the actual four pinned packages without losing settings intent or trim retention",async()=>{
    await f.db.updateTable("check_definitions").set({enabled:false,enablement_version:"2"}).where("definition_key","=","disk-local").execute();
    const policy=await f.setPolicy("package-updates",0,1,"override",{interval_seconds:900,timeout_seconds:12,package_mode:"with-new-pkgs"});
    expect(policy.status).toBe(200);
    const delivery=f.baselines.find((a)=>a.definition_key==="fstrim-status")!;
    const input=sample("fstrim-status",delivery,f.clock(),1);
    input.observation.fstrim.timer.next_elapse=Math.floor(f.clock().getTime()/1000)+7*86400;
    expect((await f.run(input)).status).toBe(200);
    const old=await f.db.selectFrom("baseline_runs").selectAll().where("id","=",input.run_id).executeTakeFirstOrThrow();
    const directories:Record<string,string>={};
    for(const [key,pkg] of Object.entries(pinnedOfficial.packages)){
      const dir=path.join(root,key);directories[key]=dir;
      for(const [name,content] of Object.entries(pkg.files)){await mkdir(path.dirname(path.join(dir,name)),{recursive:true});await writeFile(path.join(dir,name),content);}
    }
    const command={request_id:randomUUID(),directories};
    const result=await importLegacySkills(f.db,f.session,command,f.clock,store);
    expect(await importLegacySkills(f.db,f.session,command,f.clock,store)).toEqual(result);
    const installations=await f.db.selectFrom("skill_installations").selectAll().execute();
    expect(installations).toHaveLength(4);
    expect(installations.find((i)=>i.subject_key==="disk-local")!.enabled).toBe(false);
    for(const i of installations)expect(i.content_sha256).toBe(pinnedOfficial.packages[i.subject_key as keyof typeof pinnedOfficial.packages].content_sha256);
    const updates=installations.find((i)=>i.subject_key==="package-updates")!;
    expect((await f.db.selectFrom("host_skill_policies").selectAll().where("installation_id","=",updates.id).executeTakeFirstOrThrow()).overrides)
      .toEqual({interval_seconds:900,timeout_seconds:12,package_mode:"with-new-pkgs"});
    const trim=await f.db.selectFrom("skill_states").selectAll().executeTakeFirstOrThrow();
    expect(trim.last_sequence).toBe("0");
    const oldContext=old.fstrim_context as {expected_at:number;last_execution:{recorded_at:string}};
    expect(trim.state).toMatchObject({expected_at:oldContext.expected_at,last_execution:{recorded_at:Date.parse(oldContext.last_execution.recorded_at)}});
    expect(await f.db.selectFrom("baseline_runs").selectAll().where("id","=",old.id).executeTakeFirstOrThrow()).toEqual(old);
  });

  it("requires explicit compatible version selection and prunes only expired details while preserving receipts",async()=>{
    const skill=await install(),assignment=(await fetch()).assignments[0]!;
    const input=run(assignment.assignment_id!,1);
    await acceptPackageRun(f.db,f.agentCredential,input,f.clock,store);
    async function version(name:string,incompatible=false){
      const dir=path.join(root,name);await cp(source,dir,{recursive:true});
      const manifest=JSON.parse(await readFile(path.join(dir,"skill.json"),"utf8"));manifest.version=name;
      await writeFile(path.join(dir,"skill.json"),JSON.stringify(manifest));
      if(incompatible){const schema=JSON.parse(await readFile(path.join(dir,"settings.schema.json"),"utf8"));schema.properties.warning_percent.maximum=98;await writeFile(path.join(dir,"settings.schema.json"),JSON.stringify(schema));}
      return importSkillDirectory(f.db,f.session,{request_id:randomUUID(),directory:dir},f.clock,store);
    }
    const next=await version("1.0.1"),bad=await version("1.0.2",true);
    await writeFile(path.join(root,"1.0.1/README.md"),"Changed bytes under the same version.\n");
    await expect(importSkillDirectory(f.db,f.session,{request_id:randomUUID(),directory:path.join(root,"1.0.1")},f.clock,store)).rejects.toMatchObject({code:"package_version_conflict"});
    expect(next.selected).toBe(false);
    expect((await f.db.selectFrom("skill_installations").selectAll().executeTakeFirstOrThrow()).content_sha256).toBe(skill.content_sha256);
    await expect(selectPackageVersion(f.db,f.session,skill.installation_id,{request_id:randomUUID(),content_sha256:bad.content_sha256,
      expected_enablement_version:"2",grants:skill.artifact.metadata.manifest.capabilities},f.clock,store)).rejects.toMatchObject({code:"incompatible_package_version"});
    const command={request_id:randomUUID(),content_sha256:next.content_sha256,expected_enablement_version:"2",grants:skill.artifact.metadata.manifest.capabilities};
    await selectPackageVersion(f.db,f.session,skill.installation_id,command,f.clock,store);
    expect(await f.db.selectFrom("skill_states").selectAll().execute()).toHaveLength(0);
    expect((await f.db.selectFrom("skill_observations").selectAll().executeTakeFirstOrThrow()).content_sha256).toBe(skill.content_sha256);
    await f.advanceSeconds(91*86400);
    const result=await pruneExpiredObservations(f.db,"tinywarden_test_p1b",true,f.clock);
    expect(result.outcome).toBe("complete");expect(result.package_readings).toBe(1);
    expect(await f.db.selectFrom("skill_observations").selectAll().execute()).toHaveLength(0);
    expect(await f.db.selectFrom("skill_package_receipts").selectAll().execute()).toHaveLength(1);
    expect(await f.db.selectFrom("skill_packages").selectAll().execute()).toHaveLength(3);
  });

  it("preserves field inheritance and receipts while a fifth skill flows through display, history and captured alerts", async () => {
    const skill=await install(), id=skill.installation_id;
    const policy={request_id:randomUUID(),expected_default_revision:"1",expected_policy_version:"0",overrides:{warning_percent:80}};
    await setPackagePolicy(f.db,f.session,f.hostId,id,policy,f.clock,store);
    const defaults={request_id:randomUUID(),expected_revision:"1",settings:{warning_percent:88,critical_percent:97,interval_seconds:300}};
    const saved=await updatePackageDefaults(f.db,f.session,id,defaults,f.clock,store);
    expect(await updatePackageDefaults(f.db,f.session,id,defaults,f.clock,store)).toEqual(saved);
    const assignments=await fetch(), entry=assignments.assignments[0]!;
    expect(entry.settings).toEqual({warning_percent:80,critical_percent:97,interval_seconds:300});
    expect((await fetch()).assignments[0]!.assignment_id).toBe(entry.assignment_id);
    const input=run(entry.assignment_id!,1);
    const receipt=await acceptPackageRun(f.db,f.agentCredential,input,f.clock,store);
    await f.advanceSeconds(1);
    expect(await acceptPackageRun(f.db,f.agentCredential,input,f.clock,store)).toEqual(receipt);
    const view=await readPackageResults(f.db,f.session,f.hostId,f.clock);
    expect(view.skills[0]!.state).toBe("warning");
    const skillView=view.skills[0]!;
    expect(renderToStaticMarkup(PackageFacts({facts:skillView.assessment!.facts,catalog:skillView.metadata.catalog}))).toContain("Used memory");
    const history=await runHistory(f.db,"tinywarden_test_p1b",f.clock);
    expect(history.outcome).toBe("completed");
    const control=await f.db.selectFrom("history_control").selectAll().executeTakeFirstOrThrow();
    await f.advanceSeconds(60);
    await acceptPackageRun(f.db,f.agentCredential,run(entry.assignment_id!,2,98),f.clock,store);
    await captureHistoryFamily(f.db,control.epoch,f.hostId,"packages",f.clock);
    const events=await readHistory(f.db,f.session,{limit:25,skills:["example/memory-pressure"]},f.clock);
    expect(events.events.some((event) => event.to_state === "critical" && event.after_facts?.package?.name === "Memory availability")).toBe(true);
    await withNotificationLock(f.db,"tinywarden_test_p1b",(db) => sampleFamily(db,f.routeId,f.settings,f.hostId,"example/memory-pressure",f.clock));
    await f.tick();
    expect(f.captured.some((mail) => mail.toString().includes("Memory availability"))).toBe(true);
    await setPackageEnabled(f.db,f.session,id,{request_id:randomUUID(),expected_enablement_version:"2",content_sha256:skill.content_sha256,enabled:false,grants:[]},f.clock);
    expect((await fetch()).assignments).toEqual([]);
    expect((await readPackageResults(f.db,f.session,f.hostId,f.clock)).skills[0]!.state).toBe("disabled");
    await expect(acceptPackageRun(f.db,f.agentCredential,run(entry.assignment_id!,3),f.clock,store)).rejects.toMatchObject({code:"assignment_unknown"});
  });

  it("rejects changed retries and invalid settings; delayed evidence cannot replace newer state", async () => {
    const skill=await install(), entry=(await fetch()).assignments[0]!;
    await expect(updatePackageDefaults(f.db,f.session,skill.installation_id,{request_id:randomUUID(),expected_revision:"1",settings:{warning_percent:96,critical_percent:95,interval_seconds:300}},f.clock,store)).rejects.toMatchObject({code:"invalid_settings"});
    const newest=run(entry.assignment_id!,2,98);await acceptPackageRun(f.db,f.agentCredential,newest,f.clock,store);
    await expect(acceptPackageRun(f.db,f.agentCredential,{...newest,observation:{...newest.observation,used_percent:90}},f.clock,store)).rejects.toMatchObject({code:"idempotency_conflict"});
    const delayed={...run(entry.assignment_id!,1,10),finished_at:new Date(f.clock().getTime()-2000).toISOString(),started_at:new Date(f.clock().getTime()-3000).toISOString()};
    expect((await acceptPackageRun(f.db,f.agentCredential,delayed,f.clock,store)).current).toBe(false);
    expect((await readPackageResults(f.db,f.session,f.hostId,f.clock)).skills[0]!.state).toBe("critical");
    const state=await f.db.selectFrom("skill_states").selectAll().executeTakeFirstOrThrow();
    expect(state.last_sequence).toBe("2");
    expect(await f.db.selectFrom("skill_observations").select("id").execute()).toHaveLength(2);
    const failure={...run(entry.assignment_id!,3),outcome:"capability_denied" as const,observation:null};
    await acceptPackageRun(f.db,f.agentCredential,failure,f.clock,store);
    expect((await readPackageResults(f.db,f.session,f.hostId,f.clock)).skills[0]!.state).toBe("unknown");
  });
});
