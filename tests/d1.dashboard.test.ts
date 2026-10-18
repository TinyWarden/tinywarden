import {describe,it,expect,beforeEach,afterEach} from "vitest";
import {randomUUID} from "node:crypto";
import {parseLayout,resolveColumns,readDashboardLayout,saveDashboardLayout,dashboardCatalog} from "../server/fleet/dashboard-layout";
import {defaultDashboardLayout,columnKey,type DashboardColumn} from "../lib/skills/dashboard-types";
import {dashboardValues} from "../server/fleet/dashboard-values";
import type {FleetEvidence} from "../server/skills/results/fleet-evidence";
import {notificationFixture,url} from "./p4b.fixture";
import {operatorDashboardLayout} from "../server/http/dashboard-handlers";
import {validLayoutRead,validCells} from "../components/operator/dashboard-validation";
import {authorize} from "../server/access/session";
import {admitArtifact,createInstallation} from "../server/skills/catalog/package-install";
import {notificationMetadata} from "./skills/packages/notification-fixture";
import {readDashboard} from "../server/fleet/dashboard";
import {compactDashboardTime} from "../components/operator/format";
describe("D1 compact dashboard time",()=>{
  it("uses 24-hour dashboard time and keeps the full timestamp",()=>{
    const value=Date.parse("2026-10-12T00:59:00Z"),stamp=compactDashboardTime(value,"2026-10-18T12:00:00Z");
    expect(stamp.label).toBe("Oct 12 · 03:59");expect(stamp.full).toContain("2026");expect(stamp.full).toContain("03:59:00");expect(stamp.dateTime).toBe("2026-10-12T00:59:00.000Z");
  });
  it("shows the year for readings outside the current dashboard year",()=>{
    expect(compactDashboardTime(Date.parse("2025-10-12T00:59:00Z"),"2026-10-18T12:00:00Z").label).toBe("Oct 12, 2025 · 03:59");
  });
  it("compares years in the dashboard timezone across UTC New Year",()=>{
    expect(compactDashboardTime(Date.parse("2025-12-31T22:30:00Z"),"2026-01-01T00:00:00Z").label).toBe("Jan 1 · 00:30");
  });
});
describe("D1 dashboard declaration projection",()=>{
  const column:DashboardColumn={ref:{kind:"skill",skill_id:"acme/memory",field_id:"used"},label:"Memory",skill_name:"Memory pressure",available:true};
  const assessment={from:1,status:"healthy",reason:{key:"reason",params:{}},facts:[{key:"used",kind:"percent",label_key:"used",value:0}]};
  const skill={metadata:{manifest:{id:"acme/memory"},catalog:{},display:{format:2,sources:{used:{kind:"percent"}},sections:[],dashboard:{fields:[{id:"used",type:"meter",label_key:"used",value:{fact:"used"},min:{value:0},max:{value:100},thresholds:[{at:{setting:"warning"},severity:"warning"}],status:"assessment"}]}}},assessment,settings:{warning:80},state:"healthy",measured_at:"2026-10-10T00:00:00.000Z",valid_until:"2026-10-10T00:05:00.000Z"};
  const values=(overrides:Record<string,unknown>={})=>dashboardValues({packages:[{...skill,...overrides}]} as unknown as FleetEvidence,[column])[columnKey(column.ref)]!;
  it("renders independent declared values with assignment thresholds and preserves zero",()=>{expect(values()).toMatchObject({value:0,state:"healthy",meter:{min:0,max:100,thresholds:[{value:80,severity:"warning"}]}});});
  it("never substitutes retained sample data for ineligible current assessment",()=>{for(const state of ["disabled","stale","unknown"]){expect(values({state,assessment:null,sample_assessment:assessment})).toMatchObject({state,value:null,meter:null});}});
  it("keeps partial unknown values visibly unknown and missing scalars missing",()=>{expect(values({state:"unknown",assessment:{...assessment,status:"unknown"}})).toMatchObject({value:0,state:"unknown",meter:{status:"unknown"}});expect(values({assessment:{...assessment,facts:[]}}).value).toBeNull();});
  it("offers generic health without package dashboard declarations or retained sample values",()=>{
    const health:DashboardColumn={...column,ref:{kind:"skill_status",skill_id:"acme/memory"},label:"Memory pressure health"};
    for(const state of ["healthy","warning","critical","unknown","stale","disabled","not_configured"]){
      const cells=dashboardValues({packages:[{...skill,metadata:{manifest:skill.metadata.manifest},state,assessment:null,sample_assessment:assessment}]} as unknown as FleetEvidence,[health]);
      expect(cells[columnKey(health.ref)]).toEqual({state,value:null,source:null,context:null,truncated:false,meter:null,measured_at:skill.measured_at,valid_until:skill.valid_until});
      expect(validCells(cells)).toBe(true);
    }
    expect(dashboardValues({packages:[]} as unknown as FleetEvidence,[health])[columnKey(health.ref)]).toMatchObject({state:"unavailable",value:null});
  });
  it("keeps platform health identities separate from authored fields and validates their closed shape",()=>{
    const d=defaultDashboardLayout(),health={kind:"skill_status" as const,skill_id:"acme/memory"};
    d.sections[0].columns=[health,{kind:"skill",skill_id:"acme/memory",field_id:"status"}];
    expect(parseLayout(d).sections[0].columns).toHaveLength(2);
    for(const ref of [{...health,field_id:"status"},{...health,skill_id:"invalid"}]){
      expect(()=>parseLayout({...d,sections:[{...d.sections[0],columns:[ref]},d.sections[1]]})).toThrow();
    }
    d.sections[0].columns=[health,health];expect(()=>parseLayout(d)).toThrow();
  });
  it("accepts the health option alongside all eight authored fields in client reads",()=>{
    const health:DashboardColumn={...column,ref:{kind:"skill_status",skill_id:"acme/memory"}};
    const fields=[health,...Array.from({length:8},(_,i)=>({...column,ref:{kind:"skill" as const,skill_id:"acme/memory",field_id:`value_${i}`}}))];
    const v={schema_version:1,as_of:skill.measured_at,revision:"0",layout:defaultDashboardLayout(),columns:[],catalog:{server:[{...column,ref:{kind:"server",field:"os"}},{...column,ref:{kind:"server",field:"agent_version"}}],skills:[{id:"acme/memory",name:"Memory pressure",enabled:true,fields}]}};
    expect(validLayoutRead(v)).toBe(true);v.catalog.skills[0]!.fields.push(column);expect(validLayoutRead(v)).toBe(false);
  });
  it("strictly bounds selections and rejects arbitrary layout features",()=>{
    for(const raw of [{...defaultDashboardLayout(),html:"evil"},{...defaultDashboardLayout(),sections:[]},{...defaultDashboardLayout(),sections:[{id:"servers",type:"server_table",columns:Array(33).fill(column.ref)},defaultDashboardLayout().sections[1]]}])expect(()=>parseLayout(raw)).toThrow();
    const d=defaultDashboardLayout();d.sections[0].columns=[column.ref,column.ref];expect(()=>parseLayout(d)).toThrow();
  });
  it("sorts by names without pinning version and preserves unavailable identities",()=>{
    const d=defaultDashboardLayout();d.sections[0].columns=[column.ref,{kind:"skill",skill_id:"acme/disk",field_id:"used"}];
    const catalog={server:[],skills:[{id:"acme/memory",name:"Memory pressure",enabled:true,fields:[column]}]};
    expect(resolveColumns(d,catalog).map(c=>[c.ref,c.available])).toEqual([[d.sections[0].columns[1],false],[column.ref,true]]);
  });
});
describe.skipIf(!url)("D1 authorized layout storage",()=>{
  let f:Awaited<ReturnType<typeof notificationFixture>>;
  beforeEach(async()=>{f=await notificationFixture();});afterEach(async()=>{await f?.db.destroy();});
  const save=(revision:string,request=randomUUID(),layout=defaultDashboardLayout())=>saveDashboardLayout(f.db,f.session,{request_id:request,expected_revision:revision,layout},f.clock);
  it("returns defaults without initializing preferences; rejects unauthenticated reads",async()=>{
    expect(await readDashboardLayout(f.db,f.session,f.clock)).toMatchObject({revision:"0",layout:defaultDashboardLayout()});
    expect(await f.db.selectFrom("operator_dashboard_layouts").selectAll().execute()).toHaveLength(0);
    await expect(readDashboardLayout(f.db,"invalid",f.clock)).rejects.toMatchObject({code:"unauthorized"});
  });
  it("serializes first creation, supports exact retry and rejects stale or differing replay",async()=>{
    const id=randomUUID();expect(await save("0",id)).toEqual({revision:"1"});expect(await save("0",id)).toEqual({revision:"1"});
    await expect(save("1",id)).rejects.toMatchObject({code:"idempotency_conflict"});
    const results=await Promise.allSettled([save("1"),save("1")]);expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    await expect(save("0",id)).rejects.toMatchObject({code:"settings_conflict"});
    expect((await readDashboardLayout(f.db,f.session,f.clock)).revision).toBe("2");
  });
  it("persists selected values and sidebar state, but does not accept invented fields",async()=>{
    const d=defaultDashboardLayout();d.sections[0].columns=[{kind:"server",field:"os"}];d.sections[1].visible=false;await save("0",randomUUID(),d);
    expect((await readDashboardLayout(f.db,f.session,f.clock)).layout).toEqual(d);
    d.sections[0].columns.push({kind:"skill",skill_id:"acme/missing",field_id:"used"});await expect(save("1",randomUUID(),d)).rejects.toMatchObject({code:"settings_conflict"});
    const request=f.req("/api/v1/operator/dashboard/layout",{schema_version:1,request_id:randomUUID(),expected_revision:"1",layout:d,operator_id:randomUUID()},undefined,f.session);
    expect((await operatorDashboardLayout(request,f.ctx)).status).toBe(400);
  });
  it("catalogues and saves health for packages with no fields, respects visibility and preserves missing selections",async()=>{
    const metadata={...notificationMetadata("disk-local"),size:1024};
    await f.db.transaction().execute(async trx=>{const actor=await authorize(trx,f.session,f.clock);await admitArtifact(trx,metadata,true,actor.at);await createInstallation(trx,metadata,actor);});
    const before=await readDashboardLayout(f.db,f.session,f.clock),skill=before.catalog.skills.find(s=>s.id===metadata.manifest.id)!;
    expect(skill.fields).toEqual([{ref:{kind:"skill_status",skill_id:metadata.manifest.id},label:"Disk space health",skill_name:"Disk space",available:true}]);
    expect(before.layout.sections[0].columns).toEqual([]);
    const d=defaultDashboardLayout();d.sections[0].columns=[skill.fields[0]!.ref];await save("0",randomUUID(),d);
    const view=await readDashboard(f.db,f.session,{},f.clock),hosts=Object.values(view.groups).flatMap(g=>g.hosts);
    expect(view.columns).toEqual(skill.fields);expect(hosts).toHaveLength(1);
    expect(hosts[0]!.dashboard_values[columnKey(skill.fields[0]!.ref)]).toMatchObject({state:"disabled",value:null,source:null,context:null});
    await f.db.transaction().execute(async trx=>{const actor=await authorize(trx,f.session,f.clock);expect((await dashboardCatalog(trx,{...actor,role:"user",operatorId:randomUUID()})).skills).toEqual([]);});
    await f.db.deleteFrom("skill_settings_revisions").execute();await f.db.deleteFrom("skill_installations").execute();
    const removed=await readDashboardLayout(f.db,f.session,f.clock);expect(removed.layout).toEqual(d);expect(removed.columns[0]).toMatchObject({ref:skill.fields[0]!.ref,available:false});
    await save("1",randomUUID(),d);
    d.sections[0].columns.push({kind:"skill_status",skill_id:"acme/missing"});await expect(save("2",randomUUID(),d)).rejects.toMatchObject({code:"settings_conflict"});
  });
});
