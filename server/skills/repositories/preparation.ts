import type {Selectable} from "kysely";
import {randomUUID} from "node:crypto";
import {mkdir,mkdtemp,writeFile,rm} from "node:fs/promises";
import path from "node:path";
import {officialRepository,versionCompare,stableVersion} from "../../../lib/skills/repositories";
import type {SkillPreparation as PreparationTable,Origin} from "../../db/skill-repository-types";
import {packageStore,packageDirectory,publishPackage} from "../runtime/storage";
import {runtimeRequest,SkillRuntimeError} from "../runtime/client";
import type {PackageMetadata} from "../../../lib/skills/package-types";
import {validateSettings} from "../settings/package-validation";
import {packageRead,canonicalText,nextCounter,commandFingerprint} from "../catalog/package-commands";
import {admitArtifact,createInstallation} from "../catalog/package-install";
import {selectPackageVersion} from "../catalog/package-version";
import {authorize,completeAuthorization,type SessionContext} from "../../access/session";
import {requireAdmin} from "../../access/scope";
import {fail} from "../../errors";
import {uuid} from "../../validation";
import {jsonValue} from "../../db/json";
import {mutate,finish,receipt,type Db,type Trx} from "./commands";
import {isOfficial} from "./catalog";
import {GithubClient,RepositoryError} from "./github";
import {removePreview} from "./retention";
type SkillPreparation=Selectable<PreparationTable>;
const reserved=(p:SkillPreparation)=>p.origin?.github_id===officialRepository.id&&p.origin?.owner_id===officialRepository.ownerId;
export function preparationView(p:SkillPreparation){return {id:p.id,repository_id:p.repository_id,entry:p.entry,installation_id:p.installation_id,
  metadata:p.metadata,origin:p.origin,expires_at:p.expires_at.toISOString(),state:p.state,compatible:p.compatible===true,content_sha256:p.entry.content_sha256};}
export async function readPreparation(db:Db,cookie:string,id:string,clock:()=>Date){uuid(id);return packageRead(db,async trx=>{
  const actor=await authorize(trx,cookie,clock);requireAdmin(actor);
  const p=await trx.selectFrom("skill_repository_preparations").selectAll().where("id","=",id).where("operator_id","=",actor.operatorId).executeTakeFirst();
  if(!p)fail("not_found",404);await completeAuthorization(trx,actor,clock());return {preparation:preparationView(p)};
});}
export async function assertPreparation(trx:Trx,p:SkillPreparation,actor:SessionContext){
  const [head,operator,repo]=await Promise.all([trx.selectFrom("skill_repository_preparations").selectAll().where("id","=",p.id).executeTakeFirstOrThrow(),
    trx.selectFrom("operators").select("auth_version").where("id","=",actor.operatorId).executeTakeFirstOrThrow(),
    trx.selectFrom("skill_repositories").selectAll().where("id","=",p.repository_id).executeTakeFirstOrThrow()]);
  if(head.state!=="ready"||head.expires_at<=actor.at||head.operator_id!==actor.operatorId||head.auth_version!==operator.auth_version)fail("preparation_expired",409);
  if(!repo.enabled||repo.removed||repo.error||repo.revision!==p.repository_revision||repo.catalogue_revision!==p.catalogue_revision||
    canonicalText(repo.catalogue?.skills.find(v=>v.id===p.entry.id))!==canonicalText(p.entry))fail("settings_conflict",409);
  const installation=await trx.selectFrom("skill_installations").selectAll().where("skill_id","=",p.entry.id).executeTakeFirst();
  if(p.installation_id){
    if(!installation||installation.id!==p.installation_id||installation.content_sha256!==p.expected_digest||installation.enablement_version!==p.expected_enablement||installation.settings_revision!==p.expected_settings)fail("settings_conflict",409);
    const source=await trx.selectFrom("skill_installation_sources").selectAll().where("installation_id","=",installation.id).executeTakeFirst();
    if((source?.revision??null)!==p.expected_source||source?.repository_id&&source.repository_id!==p.repository_id)fail("repository_source_conflict",409);
    if(source?.kind!=="repository"&&installation.content_sha256!==p.entry.content_sha256)fail("repository_source_conflict",409);
  }else if(installation)fail("repository_source_conflict",409);
}
export async function prepareRepositoryPackage(db:Db,cookie:string,input:{request_id:string;repository_id:string;skill_id:string;content_sha256:string;catalogue_revision:string},clock:()=>Date,store=packageStore,github=new GithubClient()){
  uuid(input.repository_id);
  const start=await mutate(db,cookie,input.request_id,"prepare",input,clock,async(trx,actor)=>{
    const repo=await trx.selectFrom("skill_repositories").selectAll().where("id","=",input.repository_id).executeTakeFirst();
    if(!repo||!repo.enabled||repo.removed||repo.error)fail("repository_disabled",409);
    const entry=repo.catalogue?.skills.find(v=>v.id===input.skill_id&&v.content_sha256===input.content_sha256);
    if(!entry||repo.catalogue_revision!==input.catalogue_revision||!repo.commit_sha||!repo.catalogue_sha256)fail("settings_conflict",409);
    const alive=await trx.selectFrom("skill_repository_preparations").select("operator_id").where("expires_at",">",actor.at).where("state","in",["preparing","ready"]).limit(21).execute();
    if(alive.length>=20||alive.filter(v=>v.operator_id===actor.operatorId).length>=2)fail("preparation_limit",429);
    const installation=await trx.selectFrom("skill_installations").selectAll().where("skill_id","=",entry.id).executeTakeFirst();
    const source=installation?await trx.selectFrom("skill_installation_sources").selectAll().where("installation_id","=",installation.id).executeTakeFirst():undefined;
    if(installation&&source?.kind==="repository"){const current=await trx.selectFrom("skill_packages").select("version").where("content_sha256","=",installation.content_sha256).executeTakeFirstOrThrow();
      if(installation.content_sha256!==entry.content_sha256&&(!stableVersion(current.version)||versionCompare(entry.version,current.version)<=0))fail("settings_conflict",409);}
    if(installation&&(source?.repository_id&&source.repository_id!==repo.id||source?.kind!=="repository"&&installation.content_sha256!==entry.content_sha256))fail("repository_source_conflict",409);
    const operator=await trx.selectFrom("operators").select("auth_version").where("id","=",actor.operatorId).executeTakeFirstOrThrow(),id=randomUUID();
    await trx.insertInto("skill_repository_preparations").values({id,operator_id:actor.operatorId,auth_version:operator.auth_version,request_id:input.request_id,
      repository_id:repo.id,repository_revision:repo.revision,catalogue_revision:repo.catalogue_revision,entry:jsonValue(entry),installation_id:installation?.id??null,
      expected_digest:installation?.content_sha256??null,expected_enablement:installation?.enablement_version??null,expected_settings:installation?.settings_revision??null,
      expected_source:source?.revision??null,metadata:null,origin:null,compatible:null,state:"preparing",created_at:actor.at,expires_at:new Date(actor.at.getTime()+1800000)}).execute();
    return {pending:true,id,repo,entry};
  });
  if(!("pending" in start))return start;
  const previewStore=path.join(store,".previews",start.id);
  let staging:string|undefined,metadata:PackageMetadata|undefined,origin:Origin|undefined,problem:string|null=null;
  try{
    const archive=await github.archive(start.repo.name,{id:start.repo.github_id,ownerId:start.repo.owner_id},start.entry);
    await mkdir(previewStore,{recursive:true,mode:0o700});staging=await mkdtemp(path.join(previewStore,".repository-"));const file=path.join(staging,"skill.zip");
    await writeFile(file,archive.bytes,{mode:0o600,flag:"wx"});
    metadata=await runtimeRequest<PackageMetadata>({action:"publish_archive",archive:file,archive_sha256:start.entry.archive.sha256,official:isOfficial(start.repo),store:previewStore});
    if(metadata.manifest.id!==start.entry.id||metadata.manifest.version!==start.entry.version||metadata.content_sha256!==start.entry.content_sha256)throw new RepositoryError("archive_mismatch");
    await validateSettings(metadata,isOfficial(start.repo),metadata.manifest.defaults,previewStore);
    origin={repository_id:start.repo.id,github_id:start.repo.github_id,owner_id:start.repo.owner_id,name:archive.identity.name,commit_sha:start.repo.commit_sha!,
      catalogue_sha256:start.repo.catalogue_sha256!,release_id:archive.releaseId,asset_id:archive.assetId,archive_sha256:start.entry.archive.sha256,archive_size:start.entry.archive.size,verified_at:clock().toISOString()};
  }catch(e){problem=e instanceof RepositoryError?e.code:e instanceof SkillRuntimeError&&["runtime_unavailable","runtime_busy","cleanup_failed"].includes(e.code)?e.code:"package_rejected";}
  finally{if(staging)await rm(staging,{recursive:true,force:true});if(problem)await removePreview(previewStore);}
  return finish(db,cookie,input.request_id,clock,async(trx,actor)=>{
    const repo=await trx.selectFrom("skill_repositories").selectAll().where("id","=",start.repo.id).executeTakeFirstOrThrow();
    const p=await trx.selectFrom("skill_repository_preparations").selectAll().where("id","=",start.id).executeTakeFirstOrThrow();
    if(p.state!=="preparing"||repo.revision!==p.repository_revision||repo.catalogue_revision!==p.catalogue_revision||repo.removed||!repo.enabled||repo.error||p.expires_at<=actor.at)fail("settings_conflict",409);
    if(problem){await trx.updateTable("skill_repository_preparations").set({state:"failed"}).where("id","=",p.id).execute();
      if(problem==="repository_identity_changed")await trx.updateTable("skill_repositories").set({error:problem}).where("id","=",repo.id).execute();
      return {preparation:null,error:problem};}
    const old=p.installation_id?await trx.selectFrom("skill_installations as i").innerJoin("skill_packages as a","a.content_sha256","i.content_sha256").select(["a.metadata","a.official"]).where("i.id","=",p.installation_id).executeTakeFirst():undefined;
    const compatible=!old||old.official===isOfficial(start.repo)&&old.metadata.manifest.alias===metadata!.manifest.alias&&canonicalText(old.metadata.schemas.settings)===canonicalText(metadata!.schemas.settings);
    const ready=await trx.updateTable("skill_repository_preparations").set({state:"ready",compatible,metadata:jsonValue(metadata!),origin:jsonValue(origin!)}).where("id","=",p.id).returningAll().executeTakeFirstOrThrow();
    return {preparation:preparationView(ready),error:null};
  });
}
async function setSource(trx:Trx,p:SkillPreparation,id:string,actor:SessionContext){
  const originId=randomUUID();await trx.insertInto("skill_package_origins").values({id:originId,content_sha256:p.entry.content_sha256,origin:jsonValue(p.origin!)}).execute();
  const old=await trx.selectFrom("skill_installation_sources").selectAll().where("installation_id","=",id).executeTakeFirst();
  const value={kind:"repository" as const,repository_id:p.repository_id,origin_id:originId,revision:old?nextCounter(old.revision):"1"};
  await trx.insertInto("skill_installation_sources").values({installation_id:id,...value}).onConflict(c=>c.column("installation_id").doUpdateSet(value)).execute();
  await trx.updateTable("skill_repository_preparations").set({state:"committed"}).where("id","=",p.id).execute();
  void actor;
}
export interface CommitInput {request_id:string;preparation_id:string;content_sha256:string;grants:Record<string,unknown>[]}
export async function commitRepositoryPackage(db:Db,cookie:string,input:CommitInput,clock:()=>Date,store=packageStore){
  uuid(input.preparation_id);uuid(input.request_id);const fp=commandFingerprint("repository:commit",input);
  const snapshot=await packageRead(db,async trx=>{
    const actor=await authorize(trx,cookie,clock);requireAdmin(actor);const saved=await receipt(trx,actor.operatorId,input.request_id,fp,actor.at);
    if(saved){await completeAuthorization(trx,actor,clock());return {saved,p:null};}
    const p=await trx.selectFrom("skill_repository_preparations").selectAll().where("id","=",input.preparation_id).where("operator_id","=",actor.operatorId).executeTakeFirst();
    if(!p||!p.metadata||!p.origin||p.entry.content_sha256!==input.content_sha256||canonicalText(input.grants)!==canonicalText(p.metadata.manifest.capabilities))fail("invalid_request",400);
    await assertPreparation(trx,p,actor);await completeAuthorization(trx,actor,clock());return {saved:null,p};
  });
  if(snapshot.saved)return snapshot.saved;const p=snapshot.p!,metadata=p.metadata!,official=reserved(p);
  const promoted=await publishPackage(packageDirectory(input.content_sha256,path.join(store,".previews",p.id)),official,store);
  if(promoted.content_sha256!==metadata.content_sha256)fail("archive_mismatch",422);
  await validateSettings(metadata,official,metadata.manifest.defaults,store);
  if(p.installation_id&&p.expected_digest!==p.entry.content_sha256){
    return selectPackageVersion(db,cookie,p.installation_id,{request_id:input.request_id,content_sha256:input.content_sha256,expected_enablement_version:p.expected_enablement!,grants:input.grants},clock,store,undefined,
      {identity:p.id,metadata,official,validate:(trx,actor)=>assertPreparation(trx,p,actor),after:async(trx,actor,result)=>{
        await setSource(trx,p,result.installation_id,actor);
        await trx.insertInto("skill_repository_mutations").values({operator_id:actor.operatorId,request_id:input.request_id,fingerprint:fp,action:"commit",result:jsonValue(result),completed_at:actor.at}).execute();
      }});
  }
  return mutate(db,cookie,input.request_id,"commit",input,clock,async(trx,actor)=>{
    await assertPreparation(trx,p,actor);await admitArtifact(trx,metadata,official,actor.at);
    const installation=await createInstallation(trx,metadata,actor);await setSource(trx,p,installation.id,actor);
    return {installation_id:installation.id,content_sha256:metadata.content_sha256,enabled:installation.enabled,changed:false};
  });
}
export async function cancelPreparation(db:Db,cookie:string,input:{request_id:string;preparation_id:string},clock:()=>Date,store=packageStore){
  uuid(input.preparation_id);const result=await mutate(db,cookie,input.request_id,"cancel",input,clock,async(trx,actor)=>{
    await trx.updateTable("skill_repository_preparations").set({state:"cancelled"}).where("id","=",input.preparation_id).where("operator_id","=",actor.operatorId).where("state","in",["preparing","ready"]).execute();return {cancelled:true};
  });
  const p=await db.selectFrom("skill_repository_preparations").select("state").where("id","=",input.preparation_id).executeTakeFirst();
  if(p?.state==="cancelled")await removePreview(path.join(store,".previews",input.preparation_id));return result;
}
