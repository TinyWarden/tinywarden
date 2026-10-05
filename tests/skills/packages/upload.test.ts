import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, chmod, readdir, cp, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { notificationFixture,url } from "../../p4b.fixture";
import { uploadSkill,MAX_SKILL_ZIP } from "../../../server/skills/catalog/package-upload";
import { downloadSkill } from "../../../server/skills/assignments/package-download";
import { setPackageEnabled,readPackageSkills } from "../../../server/skills/catalog/package-controls";
import { fetchPackageAssignments } from "../../../server/skills/assignments/packages";
import { readPackageVersions,selectPackageVersion } from "../../../server/skills/catalog/package-version";
import { operatorPackageUpload,agentPackageDownload } from "../../../server/http/package-handlers";

async function cleanup(root:string){await chmod(root,0o700);for(const d of await readdir(root,{withFileTypes:true}))if(d.isDirectory())await cleanup(path.join(root,d.name));await rm(root,{recursive:true,force:true});}
describe.skipIf(!url)("S3 ZIP installation and exact assignment delivery",()=>{
  let f:Awaited<ReturnType<typeof notificationFixture>>,root:string,store:string,source:string,zip:Buffer;
  async function archive(){const target=path.join(root,"skill.zip");execFileSync("/usr/bin/python3.13",["-I","-S","-B","-c","import pathlib,sys,zipfile; root=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(sys.argv[2],'w',compression=zipfile.ZIP_DEFLATED); [z.write(p,p.relative_to(root).as_posix()) for p in sorted(root.rglob('*')) if p.is_file()]; z.close()",source,target]);return readFile(target);}
  beforeEach(async()=>{f=await notificationFixture();root=await mkdtemp(path.join(os.tmpdir(),"tw-s3-"));store=path.join(root,"store");source=path.join(root,"source");await cp(path.join(process.cwd(),"tests/skills/packages/fixtures/memory-pressure"),source,{recursive:true});zip=await archive();});
  afterEach(async()=>{await f?.db.destroy();if(root)await cleanup(root);});
  function request(id:string=randomUUID(),body=zip){return new Request(f.origin+"/api/v2/operator/skills/upload",{method:"POST",headers:{"Content-Type":"application/zip","X-TinyWarden-Upload-ID":id,"Origin":f.origin,"X-TinyWarden-Request":"1"},body:body as BodyInit});}
  const upload=(id?:string)=>uploadSkill(f.db,f.session,request(id),f.clock,store);
  it("keeps concurrent session-authenticated package snapshots readable",async()=>{
    const added=await upload();
    const results=await Promise.all([readPackageSkills(f.db,f.session,f.clock),readPackageSkills(f.db,f.session,f.clock),readPackageVersions(f.db,f.session,added.installation_id,f.clock)]);
    expect((results[0] as unknown[]).length).toBe(1);expect((results[1] as unknown[]).length).toBe(1);
  });
  it("installs off, exact retries are safe, and only the current assignment can download",async()=>{
    const nonce=randomUUID(),added=await upload(nonce);expect(added.enabled).toBe(false);expect(await upload(nonce)).toEqual(added);
    expect((await fetchPackageAssignments(f.db,f.agentCredential,true,f.clock)).assignments).toHaveLength(0);
    const pkg=await f.db.selectFrom("skill_packages").selectAll().executeTakeFirstOrThrow();
    await setPackageEnabled(f.db,f.session,added.installation_id,{request_id:randomUUID(),expected_enablement_version:"1",content_sha256:added.content_sha256,enabled:true,grants:pkg.metadata.manifest.capabilities},f.clock);
    const entry=(await fetchPackageAssignments(f.db,f.agentCredential,true,f.clock)).assignments[0]!;
    expect(entry.archive_sha256).toBe(pkg.metadata.archive!.sha256);
    const response=await downloadSkill(f.db,f.agentCredential,entry.assignment_id!,f.clock,store);
    expect(response.headers.get("X-TinyWarden-Archive-SHA256")).toBe(entry.archive_sha256);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(await readFile(path.join(store,".archives",`${added.content_sha256}.zip`)));
    await expect(downloadSkill(f.db,"invalid",entry.assignment_id!,f.clock,store)).rejects.toMatchObject({code:"unauthorized"});
    await setPackageEnabled(f.db,f.session,added.installation_id,{request_id:randomUUID(),expected_enablement_version:"2",content_sha256:added.content_sha256,enabled:false,grants:[]},f.clock);
    await expect(downloadSkill(f.db,f.agentCredential,entry.assignment_id!,f.clock,store)).rejects.toMatchObject({code:"assignment_unknown"});
  });
  it("leaves uploaded updates unselected, rejects changed bytes under one version and stale approvals",async()=>{
    const first=await upload(),manifest=JSON.parse(await readFile(path.join(source,"skill.json"),"utf8"));manifest.version="1.0.1";await writeFile(path.join(source,"skill.json"),JSON.stringify(manifest));zip=await archive();
    const next=await upload();expect(next.selected).toBe(false);
    const versions=await readPackageVersions(f.db,f.session,first.installation_id,f.clock);expect(versions.versions).toHaveLength(2);expect(versions.versions.filter((v)=>v.selected).map((v)=>v.content_sha256)).toEqual([first.content_sha256]);
    const input={request_id:randomUUID(),expected_enablement_version:"1",content_sha256:next.content_sha256,grants:manifest.capabilities};
    await selectPackageVersion(f.db,f.session,first.installation_id,input,f.clock,store);
    await expect(selectPackageVersion(f.db,f.session,first.installation_id,{...input,request_id:randomUUID(),content_sha256:first.content_sha256},f.clock,store)).rejects.toMatchObject({code:"settings_conflict"});
    await writeFile(path.join(source,"README.md"),"Changed bytes, same release");zip=await archive();await expect(upload()).rejects.toMatchObject({code:"package_version_conflict"});
  });
  it("checks authorization and request bounds before parsing, and removes rejected staging files",async()=>{
    expect((await operatorPackageUpload(request(),f.ctx)).status).toBe(401);
    const oversized=request();oversized.headers.set("Content-Length",String(MAX_SKILL_ZIP+1));await expect(uploadSkill(f.db,f.session,oversized,f.clock,store)).rejects.toMatchObject({code:"request_too_large"});
    await expect(uploadSkill(f.db,f.session,request(randomUUID(),Buffer.from("not a ZIP")),f.clock,store)).rejects.toMatchObject({code:"package_rejected"});
    expect((await readdir(store)).filter((p)=>p.startsWith(".upload-")||p.startsWith(".incoming-"))).toHaveLength(0);
    const r=new Request(f.origin+"/api/v2/agent/skill-packages/"+randomUUID(),{headers:{Origin:f.origin,Authorization:"Bearer "+f.agentCredential}});
    expect((await agentPackageDownload(r,randomUUID(),f.ctx)).status).toBe(400);
  });
  it("pins exact upload bytes for retry and refuses expired leases or corrupted containers",async()=>{
    const nonce=randomUUID(),added=await upload(nonce);const changed=request(nonce,Buffer.concat([zip,Buffer.from('x')]));
    await expect(uploadSkill(f.db,f.session,changed,f.clock,store)).rejects.toMatchObject({code:"package_rejected"});
    const target=path.join(root,"variant.zip");await writeFile(target,zip);execFileSync("/usr/bin/python3.13",["-I","-S","-B","-c","import sys,zipfile; z=zipfile.ZipFile(sys.argv[1],'a'); z.comment=b'other transport bytes'; z.close()",target]);
    await expect(uploadSkill(f.db,f.session,request(nonce,await readFile(target)),f.clock,store)).rejects.toMatchObject({code:"idempotency_conflict"});
    const pkg=await f.db.selectFrom("skill_packages").selectAll().executeTakeFirstOrThrow();
    await setPackageEnabled(f.db,f.session,added.installation_id,{request_id:randomUUID(),expected_enablement_version:"1",content_sha256:added.content_sha256,enabled:true,grants:pkg.metadata.manifest.capabilities},f.clock);
    const entry=(await fetchPackageAssignments(f.db,f.agentCredential,true,f.clock)).assignments[0]!;
    const p=path.join(store,".archives",`${entry.content_sha256}.zip`);await chmod(p,0o600);await writeFile(p,Buffer.alloc(pkg.metadata.archive!.size));
    await expect(downloadSkill(f.db,f.agentCredential,entry.assignment_id!,f.clock,store)).rejects.toMatchObject({code:"temporarily_unavailable"});
    await f.advanceSeconds(301);await expect(downloadSkill(f.db,f.agentCredential,entry.assignment_id!,f.clock,store)).rejects.toMatchObject({code:"assignment_unknown"});
  });
});
