import type {Selectable} from "kysely";
import {randomUUID} from "node:crypto";
import {officialRepository,repositoryUrl,versionCompare,stableVersion,type RepositoryView,type InstallationSource} from "../../../lib/skills/repositories";
import {type SkillRepository} from "../../db/skill-repository-types";
import {packageRead,nextCounter} from "../catalog/package-commands";
import {authorize,completeAuthorization} from "../../access/session";
import {requireAdmin} from "../../access/scope";
import {fail} from "../../errors";
import {jsonValue} from "../../db/json";
import {uuid} from "../../validation";
import {mutate,finish,repositoryReplay,type Db,type Trx} from "./commands";
import {GithubClient,RepositoryError} from "./github";
export const isOfficial=(row:{github_id:string;owner_id:string})=>row.github_id===officialRepository.id&&row.owner_id===officialRepository.ownerId;
export function repositoryView(r:Selectable<SkillRepository>):RepositoryView{return {id:r.id,name:r.name,url:`https://github.com/${r.name}`,official:isOfficial(r),enabled:r.enabled,removed:r.removed,revision:r.revision,catalogue_revision:r.catalogue_revision,
  checked_at:r.checked_at?.toISOString()??null,verified_at:r.verified_at?.toISOString()??null,error:r.error,retry_at:r.retry_at?.toISOString()??null,count:r.catalogue?.skills.length??0};}
export async function installationSources(db:Db|Trx,ids:string[]){
  if(!ids.length)return new Map<string,InstallationSource>();
  const rows=await db.selectFrom("skill_installation_sources as s").leftJoin("skill_repositories as r","r.id","s.repository_id")
    .leftJoin("skill_package_origins as o","o.id","s.origin_id").select(["s.installation_id","s.kind","s.revision","s.repository_id","r.name","r.enabled","r.removed","r.error","o.origin"]).where("s.installation_id","in",ids).execute();
  return new Map(rows.map(r=>[r.installation_id,{kind:r.kind,repository_id:r.repository_id,name:r.origin?.name??r.name,url:r.origin?`https://github.com/${r.origin.name}`:null,
    official:!!r.origin&&r.origin.github_id===officialRepository.id&&r.origin.owner_id===officialRepository.ownerId,available:r.enabled===true&&!r.removed&&!r.error,revision:r.revision}]));
}
export async function readRepositories(db:Db,cookie:string,clock:()=>Date){return packageRead(db,async trx=>{
  const actor=await authorize(trx,cookie,clock);requireAdmin(actor);
  const rows=await trx.selectFrom("skill_repositories").selectAll().where("removed","=",false).orderBy("name").limit(21).execute();
  if(rows.length>20)fail("repository_limit",409);await completeAuthorization(trx,actor,clock());return {repositories:rows.map(repositoryView),as_of:actor.at.toISOString()};
});}
export async function addRepository(db:Db,cookie:string,input:{request_id:string;url:string},clock:()=>Date,github=new GithubClient()){
  const saved=await repositoryReplay(db,cookie,input.request_id,"add",{url:input.url},clock);if(saved)return saved as {repository_id:string};
  let name:string;try{name=repositoryUrl(input.url);}catch{fail("repository_url_invalid",400);}
  let identity;try{identity=await github.resolve(name);}catch(e){fail(e instanceof RepositoryError?e.code:"repository_unavailable",422);}
  const result=await mutate(db,cookie,input.request_id,"add",{url:input.url},clock,async trx=>{
    const count=await trx.selectFrom("skill_repositories").select(trx.fn.countAll().as("n")).where("removed","=",false).executeTakeFirstOrThrow();
    const old=await trx.selectFrom("skill_repositories").selectAll().where("github_id","=",identity.id).executeTakeFirst();
    if(old&&old.owner_id!==identity.ownerId)fail("repository_identity_changed",409);
    if((!old||old.removed)&&Number(count.n)>=20)fail("repository_limit",409);
    const id=old?.id??randomUUID();
    if(old)await trx.updateTable("skill_repositories").set({enabled:true,removed:false,name:identity.name,revision:nextCounter(old.revision)}).where("id","=",id).execute();
    else await trx.insertInto("skill_repositories").values({id,github_id:identity.id,owner_id:identity.ownerId,name:identity.name,enabled:true,removed:false,revision:"1",catalogue_revision:"1",catalogue:null,commit_sha:null,catalogue_sha256:null,checked_at:null,verified_at:null,error:null,retry_at:null}).execute();
    return {repository_id:id};
  });
  return result;
}
export async function changeRepository(db:Db,cookie:string,id:string,input:{request_id:string;expected_revision:string;action:"enable"|"disable"|"remove"},clock:()=>Date){
  uuid(id);if(!["enable","disable","remove"].includes(input.action))fail("invalid_request",400);
  return mutate(db,cookie,input.request_id,"change",{id,...input},clock,async trx=>{
    const row=await trx.selectFrom("skill_repositories").selectAll().where("id","=",id).executeTakeFirst();
    if(!row||row.removed)fail("not_found",404);if(row.revision!==input.expected_revision)fail("settings_conflict",409);
    if(isOfficial(row)&&input.action==="remove")fail("invalid_request",400);
    const enabled=input.action==="enable",removed=input.action==="remove",revision=nextCounter(row.revision);
    await trx.updateTable("skill_repositories").set({enabled,removed,revision}).where("id","=",id).execute();
    await trx.updateTable("skill_repository_preparations").set({state:"cancelled"}).where("repository_id","=",id).where("state","in",["preparing","ready"]).execute();return {repository_id:id,revision};
  });
}
export async function refreshRepository(db:Db,cookie:string,id:string,input:{request_id:string;expected_revision:string},clock:()=>Date,github=new GithubClient()){
  uuid(id);
  const start=await mutate(db,cookie,input.request_id,"refresh",{id,...input},clock,async(trx,actor)=>{
    const row=await trx.selectFrom("skill_repositories").selectAll().where("id","=",id).executeTakeFirst();
    if(!row||row.removed||!row.enabled)fail("repository_disabled",409);if(row.revision!==input.expected_revision)fail("settings_conflict",409);
    if(row.retry_at&&row.retry_at>actor.at||row.checked_at&&actor.at.getTime()-row.checked_at.getTime()<60000)fail("repository_cooldown",429);
    await trx.updateTable("skill_repositories").set({checked_at:actor.at}).where("id","=",id).execute();return {pending:true,repository:row};
  });
  if(!("pending" in start))return start;
  const row=start.repository;let loaded:Awaited<ReturnType<GithubClient["catalogue"]>>|undefined,error:RepositoryError|undefined;
  try{loaded=await github.catalogue(row.name,{id:row.github_id,ownerId:row.owner_id});}catch(e){error=e instanceof RepositoryError?e:new RepositoryError("repository_unavailable");}
  return finish(db,cookie,input.request_id,clock,async(trx,actor)=>{
    const head=await trx.selectFrom("skill_repositories").selectAll().where("id","=",id).executeTakeFirstOrThrow();
    if(head.revision!==row.revision||head.removed||!head.enabled)fail("settings_conflict",409);
    const changed=!!loaded&&head.catalogue_sha256!==loaded.hash;
    await trx.updateTable("skill_repositories").set(loaded?{catalogue:jsonValue(loaded.catalogue),commit_sha:loaded.commit,catalogue_sha256:loaded.hash,name:loaded.identity.name,
      catalogue_revision:changed?nextCounter(head.catalogue_revision):head.catalogue_revision,verified_at:actor.at,error:null,retry_at:null}:{error:error?.code??"repository_unavailable",retry_at:error?.retryAt??null}).where("id","=",id).execute();
    if(changed||error)await trx.updateTable("skill_repository_preparations").set({state:"cancelled"}).where("repository_id","=",id).where("state","in",["preparing","ready"]).execute();
    return {repository_id:id,refreshed:!!loaded,error:error?.code??null};
  });
}
export async function readMarketplace(db:Db,cookie:string,input:{q:string;repository:string|null;page:number},clock:()=>Date){
  if(input.q.length>100||!Number.isSafeInteger(input.page)||input.page<1||input.page>80)fail("invalid_request",400);if(input.repository)uuid(input.repository);
  return packageRead(db,async trx=>{
    const actor=await authorize(trx,cookie,clock);requireAdmin(actor);
    const [repos,installations]=await Promise.all([trx.selectFrom("skill_repositories").selectAll().where("removed","=",false).limit(21).execute(),
      trx.selectFrom("skill_installations as i").innerJoin("skill_packages as p","p.content_sha256","i.content_sha256").select(["i.id","i.skill_id","i.content_sha256","p.version"]).limit(101).execute()]);
    if(repos.length>20||installations.length>100)fail("repository_limit",409);
    const sources=await installationSources(trx,installations.map(i=>i.id)),q=input.q.toLocaleLowerCase();
    const offers=repos.filter(r=>r.enabled&&(!input.repository||r.id===input.repository)).flatMap(r=>(r.catalogue?.skills??[]).map(entry=>{
      const installed=installations.find(i=>i.skill_id===entry.id),source=installed?sources.get(installed.id):undefined;
      const status=!installed?"install":source?.repository_id&&source.repository_id!==r.id?"conflict":source?.kind!=="repository"?
        installed.content_sha256===entry.content_sha256?"connect":"conflict":installed.content_sha256===entry.content_sha256?"current":
        stableVersion(installed.version)&&versionCompare(entry.version,installed.version)>0?"update":"older";
      return {repository:repositoryView(r),entry,status,installation_id:installed?.id??null,installed_version:installed?.version??null};
    })).filter(o=>`${o.entry.name} ${o.entry.id}`.toLocaleLowerCase().includes(q)).sort((a,b)=>a.entry.name.localeCompare(b.entry.name,"en",{sensitivity:"base"})||a.repository.name.localeCompare(b.repository.name));
    await completeAuthorization(trx,actor,clock());return {repositories:repos.map(repositoryView),offers:offers.slice((input.page-1)*50,input.page*50),total:offers.length,page:input.page,as_of:actor.at.toISOString()};
  });
}
