import {sql} from "kysely";
import {randomUUID} from "node:crypto";
import {mkdtemp,cp,readFile,writeFile,chmod,readdir,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {describe,it,expect} from "vitest";
import {notificationFixture,url} from "../../p4b.fixture";
import {importSkillDirectory} from "../../../server/skills/catalog/package-install";
import {setPackageEnabled} from "../../../server/skills/catalog/package-controls";
import {fetchPackageAssignments} from "../../../server/skills/assignments/packages";
import {acceptPackageRun} from "../../../server/skills/results/package-runs";
import {readMetricHistory} from "../../../server/skills/metrics/read";
import {readDashboard} from "../../../server/fleet/dashboard";
import {readPackageResults} from "../../../server/skills/results/package-projection";
import {selectPackageVersion} from "../../../server/skills/catalog/package-version";
import {updatePackageDefaults} from "../../../server/skills/settings/package-defaults";
import {metricShape} from "../../../server/skills/metrics/compatibility";
import type {DisplayMetric,DisplaySource} from "../../../lib/skills/display-types";
describe("Metric compatibility",()=>{
  it("compares measurement identity and units independently of presentation and numeric encoding",()=>{
    const sources:Record<string,DisplaySource>={mounts:{kind:"table",columns:{path:{kind:"text"},used:{kind:"text",encoding:"decimal",unit:"percent"}}}};
    const metric:DisplayMetric={title_key:"used",value:{fact:"mounts",column:"used"},series_key:"path",series_label:"path",max_series:16};
    const shape=metricShape(sources,metric);
    expect(shape).not.toBeNull();
    expect(metricShape({...sources,mounts:{kind:"table",columns:{path:{kind:"text"},used:{kind:"percent",precision:2}}}},
      {...metric,title_key:"renamed",series_label:"new_label",max_series:32})).toBe(shape);
    expect(metricShape({...sources,mounts:{kind:"table",columns:{path:{kind:"text"},used:{kind:"number",unit:"bytes"}}}},metric)).not.toBe(shape);
    expect(metricShape(sources,{...metric,value:{fact:"other",column:"used"}})).not.toBe(shape);
    expect(metricShape(sources,{...metric,value:{fact:"mounts",column:"path"}})).not.toBe(shape);
    expect(metricShape(sources,{...metric,series_key:"other"})).not.toBe(shape);
    expect(metricShape(sources,undefined)).toBeNull();
  });
});
async function remove(root:string){await chmod(root,0o700);for(const e of await readdir(root,{withFileTypes:true}))if(e.isDirectory())await remove(path.join(root,e.name));await rm(root,{recursive:true,force:true});}
describe.skipIf(!url)("Metric history on the existing PostgreSQL instance",()=>{
  it("captures once, combines only compatible versions, preserves spikes and gaps and cascades retained detail",async()=>{
    const f=await notificationFixture(),root=await mkdtemp(path.join(tmpdir(),"tw-metrics-")),source=path.join(root,"source"),store=path.join(root,"store");
    try{
      await cp(path.join(process.cwd(),"tests/skills/packages/fixtures/memory-pressure"),source,{recursive:true});
      await writeFile(path.join(source,"display.json"),JSON.stringify({format:1,sources:{used:{kind:"percent"}},metrics:{usage:{title_key:"used_label",value:{fact:"used"}}},sections:[{id:"reading",title_key:"used_label",widgets:[{id:"value",type:"facts",title_key:"used_label",facts:["used"]}]}]}));
      const imported=await importSkillDirectory(f.db,f.session,{request_id:randomUUID(),directory:source},f.clock,store);
      const artifact=await f.db.selectFrom("skill_packages").selectAll().where("content_sha256","=",imported.content_sha256).executeTakeFirstOrThrow();
      await setPackageEnabled(f.db,f.session,imported.installation_id,{request_id:randomUUID(),expected_enablement_version:"1",content_sha256:imported.content_sha256,enabled:true,grants:artifact.metadata.manifest.capabilities},f.clock);
      const start=new Date(f.clock()),assignment=(await fetchPackageAssignments(f.db,f.agentCredential,true,f.clock)).assignments[0]!;
      const inputs=[];
      for(const [index,percent]of [50,95,60,null,70].entries()){
        await f.advance(new Date(start.getTime()+index*60000));
        const input={run_id:randomUUID(),run_sequence:index+1,assignment_id:assignment.assignment_id!,started_at:new Date(f.clock().getTime()-1000).toISOString(),finished_at:f.clock().toISOString(),
          outcome:percent===null?"execution_failed" as const:"observed" as const,observation:percent===null?null:{total_bytes:"10000",available_bytes:String(10000-percent*100),used_percent:percent}};
        expect((await acceptPackageRun(f.db,f.agentCredential,input,f.clock,store)).current).toBe(true);inputs.push(input);
      }
      await acceptPackageRun(f.db,f.agentCredential,inputs[0]!,f.clock,store);
      expect(await f.db.selectFrom("skill_metric_frames").selectAll().execute()).toHaveLength(5);
      expect(await f.db.selectFrom("skill_metric_samples").selectAll().execute()).toHaveLength(4);
      await f.advance(new Date(start.getTime()+300000));
      const request={from:start,to:f.clock(),buckets:1,series:[]};
      const concurrent=await Promise.all([
        readDashboard(f.db,f.session,{},f.clock),readDashboard(f.db,f.session,{},f.clock),
        readPackageResults(f.db,f.session,f.hostId,f.clock),
        ...Array.from({length:3},()=>readMetricHistory(f.db,f.session,f.hostId,imported.installation_id,"usage",request,f.clock)),
      ]);
      expect(concurrent).toHaveLength(6);
      const view=await readMetricHistory(f.db,f.session,f.hostId,imported.installation_id,"usage",request,f.clock);
      expect(view.series[0]?.buckets[0]).toMatchObject({count:4,min:"50",max:"95",last:"70",has_gap:true,connect_from_previous:false});
      const adaptive=await readMetricHistory(f.db,f.session,f.hostId,imported.installation_id,"usage",{...request,view:"adaptive"},f.clock);
      expect(adaptive).toMatchObject({format:2,representation:"samples"});
      expect(adaptive.series[0]?.summary).toMatchObject({readings:4,last:"70"});
      expect(adaptive.series[0]?.points?.map(p=>p.value)).toEqual(["50","95","60",null,"70"]);
      expect(adaptive.series[0]?.points?.map(p=>p.connect_from_previous)).toEqual([false,true,true,false,false]);
      expect(adaptive.series[0]?.gaps.length).toBeGreaterThan(0);
      const detailed=await readMetricHistory(f.db,f.session,f.hostId,imported.installation_id,"usage",{...request,buckets:5},f.clock);
      expect(detailed.series[0]?.buckets[3]).toMatchObject({count:0,last:null,has_gap:true});
      expect(detailed.series[0]?.buckets[4]?.connect_from_previous).toBe(false);
      await expect(readMetricHistory(f.db,"invalid",f.hostId,imported.installation_id,"usage",request,f.clock)).rejects.toMatchObject({status:401});
      await expect(readMetricHistory(f.db,"invalid",f.hostId,imported.installation_id,"usage",{...request,view:"adaptive"},f.clock)).rejects.toMatchObject({status:401});
      await expect(readMetricHistory(f.db,f.session,f.hostId,imported.installation_id,"absent",request,f.clock)).rejects.toMatchObject({code:"metric_unavailable"});
      // A saved settings change is a continuity boundary, even if the measured value stays comparable.
      await updatePackageDefaults(f.db,f.session,imported.installation_id,{request_id:randomUUID(),expected_revision:"1",settings:{...artifact.metadata.manifest.defaults,warning_percent:75}},f.clock,store);
      const nextAssignment=(await fetchPackageAssignments(f.db,f.agentCredential,true,f.clock)).assignments[0]!;
      const next={...inputs[4]!,run_id:randomUUID(),run_sequence:6,assignment_id:nextAssignment.assignment_id!,started_at:new Date(f.clock().getTime()-1000).toISOString(),finished_at:f.clock().toISOString()};
      await acceptPackageRun(f.db,f.agentCredential,next,f.clock,store);
      await f.advance(new Date(start.getTime()+360000));
      const changed=await readMetricHistory(f.db,f.session,f.hostId,imported.installation_id,"usage",{...request,to:f.clock(),buckets:6},f.clock);
      expect(changed.series[0]?.buckets[5]?.has_gap).toBe(true);
      const changedAdaptive=await readMetricHistory(f.db,f.session,f.hostId,imported.installation_id,"usage",{...request,to:f.clock(),view:"adaptive"},f.clock);
      expect(changedAdaptive.series[0]?.points?.at(-1)?.connect_from_previous).toBe(false);
      expect(changedAdaptive.series[0]?.gaps.some(g=>g.reason==="context"||g.reason==="unavailable")).toBe(true);
      await f.db.insertInto("history_control").values({singleton:true,epoch:randomUUID(),activated_at:f.clock()}).execute();
      const recovered={...next,run_id:randomUUID(),run_sequence:7,started_at:new Date(f.clock().getTime()-1000).toISOString(),finished_at:f.clock().toISOString()};
      await acceptPackageRun(f.db,f.agentCredential,recovered,f.clock,store);
      await f.advance(new Date(start.getTime()+420000));
      const recovery=await readMetricHistory(f.db,f.session,f.hostId,imported.installation_id,"usage",{...request,to:f.clock(),buckets:7},f.clock);
      expect(recovery.series[0]?.buckets[6]).toMatchObject({has_gap:true,connect_from_previous:false});
      const recoveryAdaptive=await readMetricHistory(f.db,f.session,f.hostId,imported.installation_id,"usage",{...request,to:f.clock(),view:"adaptive"},f.clock);
      expect(recoveryAdaptive.series[0]?.points?.at(-1)?.connect_from_previous).toBe(false);
      const manifest=JSON.parse(await readFile(path.join(source,"skill.json"),"utf8"));manifest.version="1.0.1";await writeFile(path.join(source,"skill.json"),JSON.stringify(manifest));
      const version=await importSkillDirectory(f.db,f.session,{request_id:randomUUID(),directory:source},f.clock,store);
      await selectPackageVersion(f.db,f.session,imported.installation_id,{request_id:randomUUID(),content_sha256:version.content_sha256,expected_enablement_version:"2",grants:artifact.metadata.manifest.capabilities},f.clock,store);
      const continued=await readMetricHistory(f.db,f.session,f.hostId,imported.installation_id,"usage",{...request,to:f.clock()},f.clock);
      expect(continued.series[0]?.buckets[0]).toMatchObject({count:6,min:"50",max:"95",last:"70"});
      expect(continued.first_available).toBe(start.toISOString());
      expect(continued.versions.map(v=>v.version).sort()).toEqual(["1.0.0","1.0.1"]);
      expect((await readMetricHistory(f.db,f.session,f.hostId,imported.installation_id,"usage",{...request,to:f.clock(),digest:imported.content_sha256},f.clock)).series).toHaveLength(1);
      const versionAssignment=(await fetchPackageAssignments(f.db,f.agentCredential,true,f.clock)).assignments[0]!;
      await acceptPackageRun(f.db,f.agentCredential,{...next,run_id:randomUUID(),run_sequence:8,assignment_id:versionAssignment.assignment_id!,started_at:new Date(+f.clock()-1000).toISOString(),finished_at:f.clock().toISOString()},f.clock,store);
      await f.advance(new Date(start.getTime()+480000));
      const mixed=await readMetricHistory(f.db,f.session,f.hostId,imported.installation_id,"usage",{...request,to:f.clock(),view:"adaptive"},f.clock);
      expect(mixed.series[0]?.summary.readings).toBe(7);
      expect(mixed.series[0]?.points?.map(p=>p.value)).toEqual(["50","95","60",null,"70","70","70","70"]);
      expect(mixed.series[0]?.points?.at(-1)?.connect_from_previous).toBe(false);
      expect(mixed.first_available).toBe(start.toISOString());
      expect(mixed.digest).toBe(version.content_sha256);
      // Identical metric names and SQL storage do not make different units compatible.
      manifest.version="1.0.2";await writeFile(path.join(source,"skill.json"),JSON.stringify(manifest));
      const display=JSON.parse(await readFile(path.join(source,"display.json"),"utf8"));display.sources.used={kind:"number",unit:"count"};
      await writeFile(path.join(source,"display.json"),JSON.stringify(display));
      const incompatible=await importSkillDirectory(f.db,f.session,{request_id:randomUUID(),directory:source},f.clock,store);
      await selectPackageVersion(f.db,f.session,imported.installation_id,{request_id:randomUUID(),content_sha256:incompatible.content_sha256,expected_enablement_version:"3",grants:artifact.metadata.manifest.capabilities},f.clock,store);
      const hidden=await readMetricHistory(f.db,f.session,f.hostId,imported.installation_id,"usage",{...request,to:f.clock(),view:"adaptive"},f.clock);
      expect(hidden.series).toHaveLength(0);expect(hidden.first_available).toBeNull();expect(hidden.versions).toEqual([{digest:incompatible.content_sha256,version:"1.0.2"}]);
      await f.advance(new Date(start.getTime()+90*86400000+1));
      const expired=await readMetricHistory(f.db,f.session,f.hostId,imported.installation_id,"usage",{from:start,to:new Date(start.getTime()+60000),buckets:1,series:[],digest:imported.content_sha256},f.clock);
      expect(expired.series).toHaveLength(0);
      expect((await readMetricHistory(f.db,f.session,f.hostId,imported.installation_id,"usage",{from:start,to:new Date(start.getTime()+60000),buckets:1,series:[],digest:imported.content_sha256,view:"adaptive"},f.clock)).series).toHaveLength(0);
      await f.db.deleteFrom("skill_observations").where("id","=",inputs[0]!.run_id).execute();
      expect(await f.db.selectFrom("skill_metric_frames").selectAll().where("observation_id","=",inputs[0]!.run_id).execute()).toHaveLength(0);
      expect(await f.db.selectFrom("skill_metric_samples").selectAll().where("observation_id","=",inputs[0]!.run_id).execute()).toHaveLength(0);
      expect(await f.db.selectFrom("skill_package_receipts").selectAll().where("run_id","=",inputs[0]!.run_id).execute()).toHaveLength(1);
    }finally{await f.db.destroy();await remove(root);}
  },60000);
  it("connects valid hourly evidence and switches bounded dense reads to summaries",async()=>{
    const f=await notificationFixture(),root=await mkdtemp(path.join(tmpdir(),"tw-adaptive-")),source=path.join(root,"source"),store=path.join(root,"store");
    try{
      await cp(path.join(process.cwd(),"tests/skills/packages/fixtures/memory-pressure"),source,{recursive:true});
      const manifest=JSON.parse(await readFile(path.join(source,"skill.json"),"utf8"));manifest.defaults.interval_seconds=3600;await writeFile(path.join(source,"skill.json"),JSON.stringify(manifest));
      await writeFile(path.join(source,"display.json"),JSON.stringify({format:1,sources:{used:{kind:"percent"}},metrics:{usage:{title_key:"used_label",value:{fact:"used"}}},sections:[{id:"reading",title_key:"used_label",widgets:[{id:"value",type:"facts",title_key:"used_label",facts:["used"]}]}]}));
      const imported=await importSkillDirectory(f.db,f.session,{request_id:randomUUID(),directory:source},f.clock,store),artifact=await f.db.selectFrom("skill_packages").selectAll().where("content_sha256","=",imported.content_sha256).executeTakeFirstOrThrow();
      await setPackageEnabled(f.db,f.session,imported.installation_id,{request_id:randomUUID(),expected_enablement_version:"1",content_sha256:imported.content_sha256,enabled:true,grants:artifact.metadata.manifest.capabilities},f.clock);
      const start=f.clock(),ids=[];
      for(let i=0;i<2;i++){
        await f.advance(new Date(+start+i*3600000));const id=randomUUID();ids.push(id);
        const assignment=(await fetchPackageAssignments(f.db,f.agentCredential,true,f.clock)).assignments[0]!;
        await acceptPackageRun(f.db,f.agentCredential,{run_id:id,run_sequence:i+1,assignment_id:assignment.assignment_id!,started_at:new Date(+f.clock()-1000).toISOString(),finished_at:f.clock().toISOString(),outcome:"observed",observation:{total_bytes:"10000",available_bytes:String(i?500:5000),used_percent:i?95:50}},f.clock,store);
      }
      await f.advance(new Date(+f.clock()+1));const request={from:new Date(+start-60000),to:f.clock(),buckets:240,series:[],view:"adaptive" as const};
      const raw=await readMetricHistory(f.db,f.session,f.hostId,imported.installation_id,"usage",request,f.clock);
      expect(raw.series[0]?.points?.map(p=>p.connect_from_previous)).toEqual([false,true]);
      expect(raw.series[0]?.summary.readings).toBe(2);expect(raw.series[0]?.gaps.every(g=>g.reason==="before_first_retained")).toBe(true);
      // Fixture expansion exercises the bounded SQL representation switch without hundreds of sandbox invocations.
      await sql`INSERT INTO tinywarden.skill_observations(id,assignment_id,installation_id,host_id,agent_id,generation,content_sha256,run_sequence,started_at,finished_at,received_at,evidence_expires_at,observation,outcome,assessments,request_digest,current)
        SELECT gen_random_uuid(),assignment_id,installation_id,host_id,agent_id,generation,content_sha256,1000+i,
          started_at+i*interval '1 minute',finished_at+i*interval '1 minute',received_at+i*interval '1 minute',evidence_expires_at+i*interval '1 minute',observation,outcome,assessments,request_digest,current
        FROM tinywarden.skill_observations CROSS JOIN generate_series(1,481) g(i) WHERE id=${ids[1]}::uuid`.execute(f.db);
      await sql`INSERT INTO tinywarden.skill_metric_frames(observation_id,host_id,installation_id,content_sha256,sampled_at,recovery_epoch,flags,format)
        SELECT id,host_id,installation_id,content_sha256,finished_at,NULL,'{}'::jsonb,1 FROM tinywarden.skill_observations WHERE installation_id=${imported.installation_id}::uuid AND run_sequence>=1000`.execute(f.db);
      await sql`INSERT INTO tinywarden.skill_metric_samples(observation_id,metric_key,series_key,label,value)
        SELECT o.id,s.metric_key,s.series_key,s.label,s.value FROM tinywarden.skill_observations o CROSS JOIN tinywarden.skill_metric_samples s
        WHERE o.installation_id=${imported.installation_id}::uuid AND o.run_sequence>=1000 AND s.observation_id=${ids[1]}::uuid`.execute(f.db);
      await f.advance(new Date(+start+3600000+482*60000));
      const dense=await readMetricHistory(f.db,f.session,f.hostId,imported.installation_id,"usage",{...request,to:f.clock(),buckets:24},f.clock);
      expect(dense).toMatchObject({representation:"buckets"});expect(dense.series[0]?.summary).toMatchObject({readings:483,last:"95"});
      expect(dense.series[0]?.buckets).toHaveLength(24);expect(dense.series[0]?.buckets?.some(b=>b.max==="95")).toBe(true);
      manifest.version="1.0.1";await writeFile(path.join(source,"skill.json"),JSON.stringify(manifest));
      const version=await importSkillDirectory(f.db,f.session,{request_id:randomUUID(),directory:source},f.clock,store);
      await selectPackageVersion(f.db,f.session,imported.installation_id,{request_id:randomUUID(),content_sha256:version.content_sha256,expected_enablement_version:"2",grants:artifact.metadata.manifest.capabilities},f.clock,store);
      const compatibleDense=await readMetricHistory(f.db,f.session,f.hostId,imported.installation_id,"usage",{...request,to:f.clock(),buckets:24},f.clock);
      expect(compatibleDense).toMatchObject({representation:"buckets",digest:version.content_sha256,first_available:start.toISOString()});
      expect(compatibleDense.series[0]?.summary).toMatchObject({readings:483,last:"95"});expect(compatibleDense.versions).toHaveLength(2);
    }finally{await f.db.destroy();await remove(root);}
  },60000);

});
