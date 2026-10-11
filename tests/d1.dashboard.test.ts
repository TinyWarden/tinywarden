import {describe,it,expect,beforeEach,afterEach} from "vitest";
import {randomUUID} from "node:crypto";
import {parseLayout,resolveColumns,readDashboardLayout,saveDashboardLayout} from "../server/fleet/dashboard-layout";
import {defaultDashboardLayout,columnKey,type DashboardColumn} from "../lib/skills/dashboard-types";
import {dashboardValues} from "../server/fleet/dashboard-values";
import type {FleetEvidence} from "../server/skills/results/fleet-evidence";
import {notificationFixture,url} from "./p4b.fixture";
import {operatorDashboardLayout} from "../server/http/dashboard-handlers";
describe("D1 dashboard declaration projection",()=>{
  const column:DashboardColumn={ref:{kind:"skill",skill_id:"acme/memory",field_id:"used"},label:"Memory",skill_name:"Memory pressure",available:true};
  const assessment={from:1,status:"healthy",reason:{key:"reason",params:{}},facts:[{key:"used",kind:"percent",label_key:"used",value:0}]};
  const skill={metadata:{manifest:{id:"acme/memory"},catalog:{},display:{format:2,sources:{used:{kind:"percent"}},sections:[],dashboard:{fields:[{id:"used",type:"meter",label_key:"used",value:{fact:"used"},min:{value:0},max:{value:100},thresholds:[{at:{setting:"warning"},severity:"warning"}],status:"assessment"}]}}},assessment,settings:{warning:80},state:"healthy",measured_at:"2026-10-10T00:00:00.000Z",valid_until:"2026-10-10T00:05:00.000Z"};
  const values=(overrides:Record<string,unknown>={})=>dashboardValues({packages:[{...skill,...overrides}]} as unknown as FleetEvidence,[column])[columnKey(column.ref)]!;
  it("renders independent declared values with assignment thresholds and preserves zero",()=>{expect(values()).toMatchObject({value:0,state:"healthy",meter:{min:0,max:100,thresholds:[{value:80,severity:"warning"}]}});});
  it("never substitutes retained sample data for ineligible current assessment",()=>{for(const state of ["disabled","stale","unknown"]){expect(values({state,assessment:null,sample_assessment:assessment})).toMatchObject({state,value:null,meter:null});}});
  it("keeps partial unknown values visibly unknown and missing scalars missing",()=>{expect(values({state:"unknown",assessment:{...assessment,status:"unknown"}})).toMatchObject({value:0,state:"unknown",meter:{status:"unknown"}});expect(values({assessment:{...assessment,facts:[]}}).value).toBeNull();});
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
});
