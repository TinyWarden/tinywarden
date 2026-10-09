import {randomUUID} from "node:crypto";
import {sql} from "kysely";
import {mkdtemp,rm,cp,readFile,writeFile,chmod,readdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {describe,it,expect} from "vitest";
import {notificationFixture,url} from "../../p4b.fixture";
import {importSkillDirectory} from "../../../server/skills/catalog/package-install";
import {setPackageEnabled} from "../../../server/skills/catalog/package-controls";
import {fetchPackageAssignments} from "../../../server/skills/assignments/packages";
import {acceptPackageRun} from "../../../server/skills/results/package-runs";
import {selectPackageVersion} from "../../../server/skills/catalog/package-version";
import {readPackageResults} from "../../../server/skills/results/package-projection";
import {readingRequest} from "../../../server/skills/results/reading-request";
import {readCollectionHistory,collectionNote,readingTime} from "../../../server/skills/results/reading-history";
import {displayLayout} from "../../../lib/skills/display-layout";
import type {SkillDisplay} from "../../../lib/skills/display-types";
async function remove(root:string){await chmod(root,0o700);for(const e of await readdir(root,{withFileTypes:true}))if(e.isDirectory())await remove(path.join(root,e.name));await rm(root,{recursive:true,force:true});}
describe("Compact collection history contract",()=>{
  it("rejects duplicate, unknown, noncanonical and out-of-range requests",()=>{
    const base="https://example.test/?from=2026-10-08T00:00:00.000Z&to=2026-10-09T00:00:00.000Z";
    expect(readingRequest(base).cursor).toBeUndefined();
    expect(readingRequest(base+"&page=55&as_of=2026-10-09T00:00:00.000Z").page).toBe(55);
    for(const extra of ["&page=0","&page=01","&page=15001","&page=2&page=3","&as_of=no","&jump_at=2026-10-10T00:00:00.000Z"])expect(()=>readingRequest(base+extra)).toThrow();
    for(const extra of ["&cursor=bad","&from=2026-10-08T00:00:00.000Z","&limit=100","&sql=select"])expect(()=>readingRequest(base+extra)).toThrow();
    expect(()=>readingRequest(base.replace("10-08","06-08"))).toThrow();
    expect(()=>readingRequest(base.replace(".000Z","Z"))).toThrow();
    expect(collectionNote("healthy","observed",null,null)).toBeNull();
    const note=collectionNote("warning","observed",{key:"issue",params:{}},{text:"😺".repeat(250)+"\n",parameters:{}})!;
    expect([...note]).toHaveLength(241);expect(note.endsWith("…")).toBe(true);expect(note).not.toContain("\n");
    expect(collectionNote("unknown","execution_failed",null,null)).not.toBe("execution_failed");
  });
  it("normalizes legacy mixed sections by type without using their titles",()=>{
    const display={format:1,sources:{used:{kind:"percent"}},sections:[{id:"mixed",title_key:"arbitrary",collapsed:true,widgets:[
      {id:"value",title_key:"arbitrary",type:"facts",facts:["used"]},{id:"trend",title_key:"arbitrary",type:"line_chart",metric:"used",default_window:"1h"}]}]} as SkillDisplay;
    expect(displayLayout(display).map(s=>[s.role,s.widgets.map(w=>w.id)])).toEqual([["current",["value"]],["graph",["trend"]]]);
  });
});
describe.skipIf(!url)("Compact history on existing PostgreSQL",()=>{
  it("pages tied collections once, keeps failures and old versions, scopes cursors and respects receipt retention",async()=>{
    const f=await notificationFixture(),root=await mkdtemp(path.join(tmpdir(),"tw-readings-")),store=path.join(root,"store");
    try{
      const installed=await importSkillDirectory(f.db,f.session,{request_id:randomUUID(),directory:path.join(process.cwd(),"tests/skills/packages/fixtures/memory-pressure")},f.clock,store);
      const artifact=await f.db.selectFrom("skill_packages").selectAll().where("content_sha256","=",installed.content_sha256).executeTakeFirstOrThrow();
      await setPackageEnabled(f.db,f.session,installed.installation_id,{request_id:randomUUID(),expected_enablement_version:"1",content_sha256:installed.content_sha256,enabled:true,grants:artifact.metadata.manifest.capabilities},f.clock);
      const assignment=(await fetchPackageAssignments(f.db,f.agentCredential,true,f.clock)).assignments[0]!;
      const start=new Date(f.clock());
      await acceptPackageRun(f.db,f.agentCredential,{run_id:randomUUID(),run_sequence:1,assignment_id:assignment.assignment_id!,started_at:new Date(+start-1000).toISOString(),finished_at:start.toISOString(),outcome:"observed",observation:{total_bytes:"10000",available_bytes:"5000",used_percent:50}},f.clock,store);
      const original=await f.db.selectFrom("skill_observations").selectAll().where("installation_id","=",installed.installation_id).executeTakeFirstOrThrow();
      const base={...original,assessments:sql<typeof original.assessments>`${JSON.stringify(original.assessments)}::jsonb`};
      const ids=Array.from({length:24},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,"0")}`);
      await f.db.insertInto("skill_observations").values(ids.map((id,i)=>({...base,id,run_sequence:String(i+2),outcome:i===0?"execution_failed":"observed",observation:i===0?null:original.observation,
        assessments:sql<typeof original.assessments>`${JSON.stringify(i===0?[]:[{...original.assessments[0]!,status:i===1?"warning":"healthy"}])}::jsonb`,current:i!==0}))).execute();
      await f.advance(new Date(+start+60000));
      const source=path.join(root,"next");await cp(path.join(process.cwd(),"tests/skills/packages/fixtures/memory-pressure"),source,{recursive:true});
      const manifest=JSON.parse(await readFile(path.join(source,"skill.json"),"utf8"));manifest.version="1.0.1";await writeFile(path.join(source,"skill.json"),JSON.stringify(manifest));
      const updated=await importSkillDirectory(f.db,f.session,{request_id:randomUUID(),directory:source},f.clock,store);
      await selectPackageVersion(f.db,f.session,installed.installation_id,{request_id:randomUUID(),content_sha256:updated.content_sha256,expected_enablement_version:"2",grants:artifact.metadata.manifest.capabilities},f.clock,store);
      const request={from:new Date(+start-86400000),to:f.clock()};
      const first=await readCollectionHistory(f.db,f.session,f.hostId,installed.installation_id,request,f.clock);
      expect(first.total).toBe(25);expect(first.readings).toHaveLength(10);expect(first.next_cursor).not.toBeNull();
      expect(first.readings.every(r=>r.note===null)).toBe(true);expect(JSON.stringify(first)).not.toContain('"facts"');
      // New receipts cannot leak into the first page's subsequent pages.
      await f.advance(new Date(+f.clock()+1000));
      await f.db.insertInto("skill_observations").values({...base,id:randomUUID(),run_sequence:"50",received_at:f.clock()}).execute();
      const withCursor=(cursor:string)=>readingRequest(`https://example.test/?${new URLSearchParams({from:request.from.toISOString(),to:request.to.toISOString(),cursor})}`);
      const second=await readCollectionHistory(f.db,f.session,f.hostId,installed.installation_id,withCursor(first.next_cursor!),f.clock);
      const third=await readCollectionHistory(f.db,f.session,f.hostId,installed.installation_id,withCursor(second.next_cursor!),f.clock);
      expect(third.next_cursor).toBeNull();expect(third.readings).toHaveLength(5);
      const numbered=await readCollectionHistory(f.db,f.session,f.hostId,installed.installation_id,{...request,page:2,asOf:new Date(first.as_of)},f.clock);
      expect(numbered.page).toBe(2);expect(numbered.total).toBe(25);expect(numbered.readings.map(r=>r.id)).toEqual(second.readings.map(r=>r.id));
      const lastPage=await readCollectionHistory(f.db,f.session,f.hostId,installed.installation_id,{...request,page:15000,asOf:new Date(first.as_of)},f.clock);
      expect(lastPage.page).toBe(3);expect(lastPage.readings.map(r=>r.id)).toEqual(third.readings.map(r=>r.id));
      await expect(readCollectionHistory(f.db,f.session,f.hostId,installed.installation_id,{...request,page:1,asOf:new Date(+f.clock()+1)},f.clock)).rejects.toMatchObject({code:"invalid_request"});

      expect(new Set([...first.readings,...second.readings,...third.readings].map(r=>r.id)).size).toBe(25);
      expect(third.readings.find(r=>r.outcome==="execution_failed")).toMatchObject({status:"unknown",current:false});
      expect(third.readings.find(r=>r.status==="warning")?.note).toBeTruthy();
      // An installation's selected version must not filter its collection log.
      expect(third.readings.every(r=>r.version==="1.0.0")).toBe(true);
      await expect(readCollectionHistory(f.db,f.session,randomUUID(),installed.installation_id,withCursor(first.next_cursor!),f.clock)).rejects.toMatchObject({code:"invalid_request"});
      await expect(readCollectionHistory(f.db,"invalid",f.hostId,installed.installation_id,request,f.clock)).rejects.toMatchObject({code:"unauthorized"});
      const lightweight=await readPackageResults(f.db,f.session,f.hostId,f.clock,false);
      expect(lightweight.readings).toEqual([]);expect(lightweight.catalogs).toEqual([]);
      expect((await readPackageResults(f.db,f.session,f.hostId,f.clock)).readings.length).toBe(26);
      const oldId=randomUUID();await f.db.insertInto("skill_observations").values({...base,id:oldId,run_sequence:"51",received_at:new Date(+start-91*86400000)}).execute();
      expect((await readCollectionHistory(f.db,f.session,f.hostId,installed.installation_id,request,f.clock)).total).toBe(26);

      const jumpAt=new Date(+start-3600000),jumpId=randomUUID();
      await f.db.insertInto("skill_observations").values({...base,id:jumpId,run_sequence:"52",started_at:new Date(+jumpAt-1000),finished_at:jumpAt}).execute();
      const jumped=await readCollectionHistory(f.db,f.session,f.hostId,installed.installation_id,{...request,jump:jumpAt},f.clock);
      expect(jumped.page).toBe(3);expect(jumped.jumped_to).toBe(jumpId);expect(jumped.readings.some(r=>r.id===jumpId)).toBe(true);
      const empty=await readCollectionHistory(f.db,f.session,f.hostId,installed.installation_id,{from:new Date(+start-7200000),to:new Date(+start-7199000),page:55,jump:new Date(+start-7199500)},f.clock);
      expect(empty).toMatchObject({page:1,total:0,readings:[],jumped_to:null});
      const plan=await sql`EXPLAIN SELECT o.id FROM tinywarden.skill_observations o WHERE o.host_id=${f.hostId}::uuid AND o.installation_id=${installed.installation_id}::uuid ORDER BY ${readingTime} DESC,o.id DESC LIMIT 11`.execute(f.db);
      expect(plan.rows.length).toBeGreaterThan(0);
      await f.db.insertInto("skill_observations").columns(Object.keys(original) as (keyof typeof original)[])
        .expression(sql`SELECT gen_random_uuid(),o.assignment_id,o.installation_id,o.host_id,o.agent_id,o.generation,o.content_sha256,
          g::bigint,o.started_at,o.finished_at,o.received_at,o.evidence_expires_at,NULL,'execution_failed','[]'::jsonb,o.request_digest,false
          FROM tinywarden.skill_observations o CROSS JOIN generate_series(100,150100) g WHERE o.id=${original.id}::uuid`).execute();
      await expect(readCollectionHistory(f.db,f.session,f.hostId,installed.installation_id,request,f.clock)).rejects.toMatchObject({code:"range_too_large"});
    }finally{await remove(root);await f.db.destroy();}
  },60000);
});
