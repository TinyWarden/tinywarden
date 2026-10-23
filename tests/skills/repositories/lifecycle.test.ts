import {randomUUID,createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdtemp,readFile,cp,writeFile,chmod,readdir,rm} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {beforeEach,afterEach,describe,it,expect} from "vitest";
import {notificationFixture,url} from "../../p4b.fixture";
import {GithubClient} from "../../../server/skills/repositories/github";
import {addRepository,refreshRepository,changeRepository,readMarketplace} from "../../../server/skills/repositories/catalog";
import {prepareRepositoryPackage,commitRepositoryPackage,cancelPreparation} from "../../../server/skills/repositories/preparation";
import {importSkillDirectory} from "../../../server/skills/catalog/package-install";
import {selectPackageVersion} from "../../../server/skills/catalog/package-version";
import {packageLock} from "../../../server/skills/catalog/package-commands";
import {readPackageSkills} from "../../../server/skills/catalog/package-controls";
import {catalogue,type CatalogueEntry} from "../../../lib/skills/repositories";
async function cleanup(dir:string){await chmod(dir,0o700);for(const p of await readdir(dir,{withFileTypes:true}))if(p.isDirectory())await cleanup(path.join(dir,p.name));await rm(dir,{recursive:true,force:true});}
describe.skipIf(!url)("repository installation and source integrity on reserved PostgreSQL",()=>{
  let f:Awaited<ReturnType<typeof notificationFixture>>,root:string,store:string,source:string,entry:CatalogueEntry,zip:Buffer,repo:string;
  let block:(()=>Promise<void>)|undefined;
  async function packageVersion(version:string,incompatible=false){
    const manifest=JSON.parse(await readFile(path.join(source,"skill.json"),"utf8"));manifest.version=version;await writeFile(path.join(source,"skill.json"),JSON.stringify(manifest));
    if(incompatible){const schema=JSON.parse(await readFile(path.join(source,"settings.schema.json"),"utf8"));schema.properties.warning_percent.maximum=98;await writeFile(path.join(source,"settings.schema.json"),JSON.stringify(schema));}
    const raw=execFileSync("/usr/bin/python3.13",["-I","-S","-B","-c","import sys,json,pathlib;sys.path.insert(0,sys.argv[1]);from packages.admission import load;print(json.dumps(load(pathlib.Path(sys.argv[2]))))",path.join(process.cwd(),"runtime/skills"),source]);
    const m=JSON.parse(raw.toString());const target=path.join(root,"skill.zip");
    execFileSync("/usr/bin/python3.13",["-I","-S","-B","-c","import pathlib,sys,zipfile;r=pathlib.Path(sys.argv[1]);z=zipfile.ZipFile(sys.argv[2],'w',compression=zipfile.ZIP_DEFLATED);[z.write(p,p.relative_to(r).as_posix()) for p in sorted(r.rglob('*')) if p.is_file()];z.close()",source,target]);
    zip=await readFile(target);entry={id:m.manifest.id,version,name:"Memory pressure",description:"Checks available memory.",content_sha256:m.content_sha256,archive:{tag:"memory-v"+version,asset:"memory.zip",sha256:createHash("sha256").update(zip).digest("hex"),size:zip.length}};
  }
  function github(){return new GithubClient(async url=>{
    const p=new URL(String(url)).pathname;
    if(p.includes("/releases/assets/")){await block?.();return new Response(zip as unknown as BodyInit);}
    if(p.includes("/releases/tags/"))return Response.json({id:10,draft:false,prerelease:false,tag_name:entry.archive.tag,assets:[{id:11,name:entry.archive.asset,state:"uploaded",size:zip.length}]});
    const raw=Buffer.from(JSON.stringify(catalogue({format:1,skills:[entry]}))),sha=createHash("sha1").update(`blob ${raw.length}\0`).update(raw).digest("hex");
    if(p.includes("/commits/"))return Response.json({sha:"a".repeat(40),commit:{tree:{sha:"b".repeat(40)}}});
    if(p.includes("/git/trees/"))return Response.json({truncated:false,tree:[{path:"SKILLS.json",mode:"100644",type:"blob",sha}]});
    if(p.includes("/git/blobs/"))return Response.json({encoding:"base64",size:raw.length,content:raw.toString("base64")});
    return Response.json({id:123,owner:{id:42},full_name:"Acme/skills",default_branch:"main",private:false});
  },f.clock);}
  const refresh=async()=>{
    f.setTime(new Date(+f.clock()+61000));const row=await f.db.selectFrom("skill_repositories").selectAll().where("id","=",repo).executeTakeFirstOrThrow();
    return refreshRepository(f.db,f.session,repo,{request_id:randomUUID(),expected_revision:row.revision},f.clock,github());
  };
  const prepare=async()=>{
    const r=await f.db.selectFrom("skill_repositories").selectAll().where("id","=",repo).executeTakeFirstOrThrow();
    const result=await prepareRepositoryPackage(f.db,f.session,{request_id:randomUUID(),repository_id:repo,skill_id:entry.id,content_sha256:entry.content_sha256,catalogue_revision:r.catalogue_revision},f.clock,store,github());
    const value=result as unknown as {preparation:{id:string;metadata:{manifest:{capabilities:Record<string,unknown>[]}}};error:null};expect(value.error).toBeNull();return value.preparation;
  };
  const confirm=(p:Awaited<ReturnType<typeof prepare>>,id=randomUUID())=>commitRepositoryPackage(f.db,f.session,{request_id:id,preparation_id:p.id,content_sha256:entry.content_sha256,grants:p.metadata.manifest.capabilities},f.clock,store);
  beforeEach(async()=>{block=undefined;f=await notificationFixture();root=await mkdtemp(path.join(os.tmpdir(),"tw-repos-"));store=path.join(root,"store");source=path.join(root,"source");await cp(path.join(process.cwd(),"tests/skills/packages/fixtures/memory-pressure"),source,{recursive:true});await packageVersion("1.0.0");const added=await addRepository(f.db,f.session,{request_id:randomUUID(),url:"https://github.com/Acme/skills"},f.clock,github());repo=added.repository_id;await refresh();},30000);
  afterEach(async()=>{await f?.db.destroy();if(root)await cleanup(root);});
  it("reviews without installing; installs off; replays exactly; updates through the shared pipeline",async()=>{
    const p=await prepare();expect(await f.db.selectFrom("skill_installations").selectAll().execute()).toHaveLength(0);
    const nonce=randomUUID(),added=await confirm(p,nonce);expect(await confirm(p,nonce)).toEqual(added);
    const first=(await readPackageSkills(f.db,f.session,f.clock))[0]!;expect(first.enabled).toBe(false);expect(first.source?.name).toBe("Acme/skills");
    await packageVersion("1.1.0");await refresh();const next=await prepare();await confirm(next);
    const after=(await readPackageSkills(f.db,f.session,f.clock))[0]!;expect(after.id).toBe(first.id);expect(after.defaults).toEqual(first.defaults);expect(after.metadata.manifest.version).toBe("1.1.0");
    await packageVersion("1.2.0",true);await refresh();const bad=await prepare();await expect(confirm(bad)).rejects.toMatchObject({code:"incompatible_package_version"});
    expect((await readPackageSkills(f.db,f.session,f.clock))[0]!.metadata.manifest.version).toBe("1.1.0");
  },30000);
  it("connects identical local content without resetting any installation fields",async()=>{
    const local=await importSkillDirectory(f.db,f.session,{request_id:randomUUID(),directory:source},f.clock,store);
    const before=await f.db.selectFrom("skill_installations").selectAll().where("id","=",local.installation_id).executeTakeFirstOrThrow();
    const p=await prepare();await confirm(p);expect(await f.db.selectFrom("skill_installations").selectAll().where("id","=",local.installation_id).executeTakeFirstOrThrow()).toEqual(before);
    expect((await readPackageSkills(f.db,f.session,f.clock))[0]!.source?.repository_id).toBe(repo);
  });
  it("cancel, source changes and expired reviews cannot change installed versions",async()=>{
    const expired=await prepare();await f.advance(new Date(+f.clock()+31*60000));await expect(confirm(expired)).rejects.toMatchObject({code:"preparation_expired"});
    const p=await prepare();await cancelPreparation(f.db,f.session,{request_id:randomUUID(),preparation_id:p.id},f.clock);await expect(confirm(p)).rejects.toMatchObject({status:409});
    const next=await prepare();const r=await f.db.selectFrom("skill_repositories").selectAll().where("id","=",repo).executeTakeFirstOrThrow();
    await changeRepository(f.db,f.session,repo,{request_id:randomUUID(),expected_revision:r.revision,action:"disable"},f.clock);await expect(confirm(next)).rejects.toMatchObject({status:409});
    expect(await f.db.selectFrom("skill_installations").selectAll().execute()).toHaveLength(0);
  });
  it("does not hold package locks during downloads; removal keeps installed data",async()=>{
    let release!:()=>void,start!:()=>void;const arrived=new Promise<void>(r=>{start=r;}),wait=new Promise<void>(r=>{release=r;});block=async()=>{start();await wait;};
    const job=prepare();await arrived;
    await f.db.transaction().execute(async trx=>{await packageLock(trx);});release();const p=await job;await confirm(p);
    const before=await f.db.selectFrom("skill_installations").selectAll().execute();const r=await f.db.selectFrom("skill_repositories").selectAll().where("id","=",repo).executeTakeFirstOrThrow();
    await changeRepository(f.db,f.session,repo,{request_id:randomUUID(),expected_revision:r.revision,action:"remove"},f.clock);
    expect(await f.db.selectFrom("skill_installations").selectAll().execute()).toEqual(before);expect((await readMarketplace(f.db,f.session,{q:"",repository:null,page:1},f.clock)).offers).toHaveLength(0);
  });
  it("requires an explicit ZIP detachment and enforces admin authority",async()=>{
    const p=await prepare();await confirm(p);const first=(await readPackageSkills(f.db,f.session,f.clock))[0]!;
    await packageVersion("1.0.1");const imported=await importSkillDirectory(f.db,f.session,{request_id:randomUUID(),directory:source},f.clock,store);
    const input={request_id:randomUUID(),content_sha256:imported.content_sha256,expected_enablement_version:first.enablement_version,grants:first.metadata.manifest.capabilities};
    await expect(selectPackageVersion(f.db,f.session,first.id,input,f.clock,store)).rejects.toMatchObject({code:"repository_source_conflict"});
    await selectPackageVersion(f.db,f.session,first.id,{...input,request_id:randomUUID(),detach_source:true},f.clock,store);
    expect((await readPackageSkills(f.db,f.session,f.clock))[0]!.source?.kind).toBe("upload");
    await f.db.updateTable("operators").set({role:"user"}).execute();await expect(readMarketplace(f.db,f.session,{q:"",repository:null,page:1},f.clock)).rejects.toMatchObject({status:403});
    await expect(addRepository(f.db,f.session,{request_id:randomUUID(),url:"https://github.com/Acme/other"},f.clock,github())).rejects.toMatchObject({status:403});
  });
});
