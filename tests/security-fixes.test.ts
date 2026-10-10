import { randomUUID } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readJson, handle } from "../server/http/response";
import { agentHeartbeat } from "../server/http/handlers";
import { packagePage } from "../server/http/package-pages";
import { readOperatorPages } from "../components/operator/package-pages";
import { validCadence } from "../server/skills/settings/package-validation";
import { visibleGrantScopes } from "../lib/skills/package-grants";
import { historyText, parseHistoryFacts } from "../server/history/facts";
import { PackageFacts } from "../components/skills/package-facts";
import { diskRunInput } from "../server/skills/results/disk-runs";

afterEach(() => {vi.useRealTimers();vi.unstubAllGlobals();});
describe("security boundaries", () => {
  it("releases shared admission on body deadline and cancels the stalled stream",async()=>{
    vi.useFakeTimers();let cancelled=false;
    const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode("{"));},cancel(){cancelled=true;}});
    const request=new Request("http://example.test",{method:"POST",headers:{"Content-Type":"application/json"},body:stream,duplex:"half"} as RequestInit);
    const read=handle(async()=>{await readJson(request);return new Response(null,{status:204});},
      {db:{} as never,config:{} as never,clock:()=>new Date()});
    await vi.advanceTimersByTimeAsync(15001);
    expect((await read).status).toBe(408);expect(cancelled).toBe(true);
    expect((await handle(async()=>new Response(null,{status:204}),{db:{} as never,config:{} as never,clock:()=>new Date()})).status).toBe(204);
  });
  it("rejects missing agent credentials without waiting for a body",async()=>{
    const request=new Request("http://example.test",{method:"POST",headers:{"Content-Type":"application/json"},
      body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode("{"));}}),duplex:"half"} as RequestInit);
    const response=await agentHeartbeat(request,{db:{} as never,config:{} as never,clock:()=>new Date()});
    expect(response.status).toBe(401);
  });
  it("reserves cadence independently of the package's own validator",()=>{
    for(const value of [0,1,86401,60.5,true,"300",null]) expect(validCadence({interval_seconds:value} as never)).toBe(false);
    for(const value of [60,300,86400]) expect(validCadence({interval_seconds:value})).toBe(true);
    expect(validCadence({})).toBe(true);
    expect(visibleGrantScopes([{operation:"systemd.properties",units:{"fstrim.service":true},properties:["Result"]}])).toBe(false);
    expect(visibleGrantScopes([{operation:"systemd.properties",units:["fstrim.service"],properties:["Result"]}])).toBe(true);
  });
  it("bounds legacy history text including Unicode and JSON escapes",()=>{
    const name=historyText("🙂".repeat(2000),1024),reason=historyText("\u0001".repeat(4608),4096);
    const facts={package:{content_sha256:"a".repeat(64),name,reason,observation_id:null}};
    expect(()=>parseHistoryFacts(facts)).not.toThrow();
    expect(name).not.toContain("\ufffd");expect(Buffer.byteLength(JSON.stringify(facts))).toBeLessThan(8192);
  });
  it("renders invalid persisted timestamps as unavailable",()=>{
    const catalog={when:{text:"Observed",parameters:{}}};
    expect(renderToStaticMarkup(PackageFacts({catalog,facts:[{key:"when",label_key:"when",kind:"time",value:9007199254740991}]}))).toContain("—");
    expect(renderToStaticMarkup(PackageFacts({catalog,facts:[{key:"when",label_key:"when",kind:"time",value:0}]}))).not.toContain("—");
  });
  it("rejects relative disk paths before storage",()=>{
    expect(()=>diskRunInput({run_id:randomUUID(),run_sequence:1,assignment_id:randomUUID(),
      started_at:"2026-10-10T00:00:00.000Z",finished_at:"2026-10-10T00:00:01.000Z",
      coverage:"complete",reason:"none",excluded_kernel:0,excluded_remote:0,dropped_runs:0,
      mounts:[{mount_id:1,mount_path:"relative",mount_root:"/",filesystem_type:"ext4",kind:"local",
        writable:true,shared_capacity:false,reason:"none",total_bytes:"100",free_bytes:"90",available_bytes:"90"}]})).toThrow();
  });
  it("pages valid large catalog entries and assembles them without losing skills",async()=>{
    const skills=Array.from({length:4},(_,index)=>({id:String(index),metadata:{catalog:"x".repeat(400000)}}));
    const first=packagePage({schema_version:1,skills,as_of:"2026-10-10T00:00:00.000Z"},0);
    expect(first.next_page).not.toBeNull();expect(first.skills.length).toBeLessThan(4);
    vi.stubGlobal("window",{location:{origin:"https://example.test"}});
    vi.stubGlobal("fetch",vi.fn(async(path:string)=>new Response(JSON.stringify(packagePage(
      {schema_version:1,skills},Number(new URL(path,"https://example.test").searchParams.get("page")??0))))));
    const result=await readOperatorPages("/api/v2/operator/skills",new AbortController().signal,()=>{}) as {skills:typeof skills};
    expect(result.skills).toEqual(skills);
  });
});
