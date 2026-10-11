import {describe,it,expect,beforeEach,afterEach,vi} from "vitest";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {verifyRelease,compare,compatible,releaseKey,type ReleaseManifest} from "../server/agent-updates/release";
import {projectMaintenance,observation} from "../server/agent-updates/status";
import {setupCode} from "../server/agent-updates/setup";
import {readDefaults,savePolicy,settings} from "../server/agent-updates/policy";
import {updatePolicy,platformStatus} from "../server/agent-updates/agent-api";
import {refreshCatalog,readCatalog} from "../server/agent-updates/catalog";
import {operatorSetup,agentSetup} from "../server/http/agent-update-handlers";
import {notificationFixture,url} from "./p4b.fixture";
const vector=JSON.parse(readFileSync(new URL("./fixtures/agent-release-vector.json",import.meta.url),"utf8"));
const metadata=verifyRelease(Buffer.from(vector.manifest),vector.signature,vector.public_key);
const platform={version:"0.0.9",managed:true,binary_sha256:metadata.binary_sha256,runtime_sha256:metadata.runtime_sha256,descriptor_sha256:metadata.descriptor_sha256,installed_version:"0.0.9",local_automatic:true,updater:{outcome:"idle" as const}};
const now=new Date("2026-10-11T12:00:00Z"),catalog={checked_at:now,verified_at:now,error:null,releases:[{manifest:vector.manifest,signature:vector.signature,metadata}]};
const policy={automatic:true,override:null,revision:"0",default_revision:"1"};
describe("AU1 signed release and presentation boundaries",()=>{
  it("shares exact-byte verification with Go without trusting a fixture key",()=>{
    expect(metadata.version).toBe("0.0.9");expect(()=>verifyRelease(Buffer.from(vector.manifest),vector.signature)).toThrow();
    expect(()=>verifyRelease(Buffer.from(vector.manifest+" "),vector.signature,vector.public_key)).toThrow();
    expect(releaseKey).toBe(readFileSync(new URL("../server/agent-updates/release-public-key.txt",import.meta.url),"utf8").trim());
    expect(compare("1.10.0","1.9.9")).toBe(1);expect(()=>compare("01.0.0","1.0.0")).toThrow();expect(compatible(metadata,"0.0.7")).toBe(false);
  });
  it("distinguishes current, stale, mismatched and future incompatible releases",()=>{
    const evidence={version:"0.0.8",generation:"1",observation:platform,observed:now,staleAfter:180};
    expect(projectMaintenance(evidence,catalog,policy,now).state).toBe("current");
    expect(projectMaintenance({...evidence,observed:new Date(now.getTime()-181000)},catalog,policy,now).state).toBe("unavailable");
    expect(projectMaintenance({...evidence,observation:{...platform,runtime_sha256:"0".repeat(64)}},catalog,policy,now).state).toBe("unrecognized");
    expect(projectMaintenance({...evidence,observation:null},catalog,policy,now).state).toBe("manual");
    expect(projectMaintenance(evidence,{...catalog,error:"github_unavailable"},policy,now).state).toBe("unavailable");
    const newer={...metadata,version:"0.0.10",required_app_capabilities:["agent_updates.v2"]} as ReleaseManifest;
    expect(projectMaintenance(evidence,{...catalog,releases:[{...catalog.releases[0]!,metadata:newer},catalog.releases[0]!]},policy,now).state).toBe("app_required");
  });
  it("rejects free-form diagnostics and configuration paths from reports",()=>{
    expect(()=>observation({...platform,command:"rm"})).toThrow();expect(()=>observation({...platform,updater:{outcome:"failed",error:"arbitrary secret"}})).toThrow();
  });
  it("uses a closed setup envelope with canonical HTTPS origin",()=>{
    const token="tw_e_11111111-1111-4111-8111-111111111111."+Buffer.alloc(32).toString("base64url");
    const code=setupCode("https://tenant.example:8443",token);expect(JSON.parse(Buffer.from(code.slice(12),"base64url").toString())).toEqual({origin:"https://tenant.example:8443",token});
    expect(()=>setupCode("https://evil.example/path",token)).toThrow();expect(()=>setupCode("http://example",token)).toThrow();
  });
});
describe.skipIf(!url)("AU1 authorized storage and setup",()=>{
  let f:Awaited<ReturnType<typeof notificationFixture>>;
  beforeEach(async()=>{f=await notificationFixture();});afterEach(async()=>{vi.restoreAllMocks();await f?.db.destroy();});
  const save=(automatic:boolean|null,host?:string,revision="0",id=randomUUID())=>savePolicy(f.db,f.session,{request_id:id,expected_revision:revision,automatic},host,f.clock,randomUUID());
  it("keeps explicit overrides, supports inheritance, and acknowledges only identical latest requests",async()=>{
    expect((await readDefaults(f.db,f.session,f.clock)).automatic).toBe(true);
    const request=randomUUID();expect(await save(false,f.hostId,"0",request)).toEqual({revision:"1"});
    expect(await save(false,f.hostId,"0",request)).toEqual({revision:"1"});
    await expect(save(true,f.hostId,"0",request)).rejects.toMatchObject({code:"idempotency_conflict"});
    await save(false,undefined,"1");expect((await settings(f.db,f.hostId)).effective).toBe(false);
    await save(true,undefined,"2");expect((await settings(f.db,f.hostId)).effective).toBe(false);
    await save(null,f.hostId,"1");expect((await settings(f.db,f.hostId)).effective).toBe(true);
    await expect(save(false,f.hostId,"1")).rejects.toMatchObject({code:"settings_conflict"});
  });
  it("stores one ordered report without changing contact or creating poll audit events",async()=>{
    const before=await f.db.selectFrom("agent_credentials").selectAll().where("agent_id","=",f.agentId).executeTakeFirstOrThrow();
    const request={schema_version:1,host_id:f.hostId,agent_id:f.agentId,generation:1,sequence:3,observed_at:f.clock().toISOString(),platform};
    expect(await platformStatus(f.db,f.agentCredential,request,f.clock)).toEqual({schema_version:1,accepted:true});
    expect((await platformStatus(f.db,f.agentCredential,{...request,sequence:2},f.clock)).accepted).toBe(false);
    await expect(platformStatus(f.db,f.agentCredential,{...request,generation:2},f.clock)).rejects.toMatchObject({code:"invalid_request"});
    const after=await f.db.selectFrom("agent_credentials").selectAll().where("agent_id","=",f.agentId).executeTakeFirstOrThrow();expect(after).toEqual(before);
    const p=await updatePolicy(f.db,f.agentCredential,{schema_version:1,host_id:f.hostId,agent_id:f.agentId,generation:1,version:"0.0.9",managed:true},f.clock);expect(p.watermark).toBe(3);expect(p.allowed).toBe(false);expect(p.reported?.version).toBe("0.0.9");
  });
  it("generates routing from configured origin and checks the token without consuming it",async()=>{
    const request=f.req("/api/v1/operator/servers/setup",{schema_version:1,request_id:randomUUID(),label:"new-server"},undefined,f.session);request.headers.set("host","evil.example");
    const response=await operatorSetup(request,f.ctx);expect(response.status).toBe(201);const result=await response.json(),decoded=JSON.parse(Buffer.from(result.setup_code.slice(12),"base64url").toString());expect(decoded.origin).toBe(f.ctx.config.origin);
    expect((await agentSetup(f.req("/api/v1/agent/setup",{schema_version:1},decoded.token),f.ctx)).status).toBe(200);
    expect((await f.db.selectFrom("enrollment_tokens").select("consumed_at").where("id","=",result.token_id).executeTakeFirstOrThrow()).consumed_at).toBeNull();
    f.setTime(new Date(f.clock().getTime()+15*60_000+1));expect((await agentSetup(f.req("/api/v1/agent/setup",{schema_version:1},decoded.token),f.ctx)).status).toBe(401);
  });
  it("records a successful empty catalogue as JSON, without inventing a release",async()=>{
    vi.spyOn(globalThis,"fetch").mockImplementation(async()=>new Response("[]",{status:200,headers:{ETag:'"fixture"'}}));
    expect(await refreshCatalog(f.db,f.clock())).toEqual({verified:0,complete:true});const c=await readCatalog(f.db);expect(c.error).toBeNull();expect(c.verified_at?.getTime()).toBe(f.clock().getTime());expect(c.releases).toEqual([]);
  });
  it("retains verified information when GitHub fails",async()=>{
    await f.db.insertInto("agent_release_catalog").values({version:metadata.version,manifest:vector.manifest,signature:vector.signature,metadata,verified_at:f.clock()}).execute();
    vi.spyOn(globalThis,"fetch").mockRejectedValue(new Error("offline"));expect((await refreshCatalog(f.db,f.clock())).complete).toBe(false);const c=await readCatalog(f.db);expect(c.releases).toHaveLength(1);expect(c.error).toBe("github_unavailable");
  });
});
