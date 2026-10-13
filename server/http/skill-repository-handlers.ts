import {handle,json,operatorPost,readJson,type HttpContext} from "./response";
import {sessionFromCookie} from "../access/session";
import {versioned} from "../validation";
import {fail} from "../errors";
import {digest,object} from "../../lib/skills/repositories";
import {addRepository,changeRepository,readRepositories,readMarketplace,refreshRepository} from "../skills/repositories/catalog";
import {prepareRepositoryPackage,commitRepositoryPackage,cancelPreparation,readPreparation} from "../skills/repositories/preparation";
function text(v:unknown):string{if(typeof v!=="string"||v.length>300)fail("invalid_request",400);return v;}
function counter(v:unknown):string{const s=text(v);if(!/^[1-9][0-9]{0,15}$/.test(s)||!Number.isSafeInteger(Number(s)))fail("invalid_request",400);return s;}
function noQuery(r:Request){if(new URL(r.url).search)fail("invalid_request",400);}
async function input(r:Request,ctx:HttpContext,names:string[]){operatorPost(r,ctx.config);noQuery(r);return versioned(await readJson(r,128*1024,true),["request_id",...names]);}
const cookie=(r:Request)=>sessionFromCookie(r.headers.get("cookie"));
export function repositoryList(r:Request,context?:HttpContext){return handle(async ctx=>{noQuery(r);return json(200,{schema_version:1,...await readRepositories(ctx.db,cookie(r),ctx.clock)});},context);}
export function repositoryAdd(r:Request,context?:HttpContext){return handle(async ctx=>{const b=await input(r,ctx,["url"]);return json(200,{schema_version:1,result:await addRepository(ctx.db,cookie(r),{request_id:text(b.request_id),url:text(b.url)},ctx.clock)});},context);}
export function repositoryChange(r:Request,id:string,context?:HttpContext){return handle(async ctx=>{const b=await input(r,ctx,["expected_revision","action"]);
  if(!["enable","disable","remove"].includes(text(b.action)))fail("invalid_request",400);
  return json(200,{schema_version:1,result:await changeRepository(ctx.db,cookie(r),id,{request_id:text(b.request_id),expected_revision:counter(b.expected_revision),action:b.action as "enable"|"disable"|"remove"},ctx.clock)});},context);}
export function repositoryRefresh(r:Request,id:string,context?:HttpContext){return handle(async ctx=>{const b=await input(r,ctx,["expected_revision"]);return json(200,{schema_version:1,result:await refreshRepository(ctx.db,cookie(r),id,{request_id:text(b.request_id),expected_revision:counter(b.expected_revision)},ctx.clock)});},context);}
export function marketplaceRead(r:Request,context?:HttpContext){return handle(async ctx=>{
  const q=new URL(r.url).searchParams;if([...q.keys()].some(k=>!["q","repository","page"].includes(k))||[...new Set(q.keys())].some(k=>q.getAll(k).length>1))fail("invalid_request",400);
  const page=q.get("page")??"1";if(!/^[1-9][0-9]?$/.test(page))fail("invalid_request",400);
  return json(200,{schema_version:1,...await readMarketplace(ctx.db,cookie(r),{q:q.get("q")??"",repository:q.get("repository"),page:Number(page)},ctx.clock)});
},context);}
export function marketplacePrepare(r:Request,context?:HttpContext){return handle(async ctx=>{
  const b=await input(r,ctx,["repository_id","skill_id","content_sha256","catalogue_revision"]);if(!digest(b.content_sha256))fail("invalid_request",400);
  return json(200,{schema_version:1,result:await prepareRepositoryPackage(ctx.db,cookie(r),{request_id:text(b.request_id),repository_id:text(b.repository_id),skill_id:text(b.skill_id),content_sha256:b.content_sha256,catalogue_revision:counter(b.catalogue_revision)},ctx.clock)});
},context);}
export function marketplaceCommit(r:Request,context?:HttpContext){return handle(async ctx=>{
  const b=await input(r,ctx,["preparation_id","content_sha256","grants"]);if(!digest(b.content_sha256)||!Array.isArray(b.grants)||!b.grants.every(object))fail("invalid_request",400);
  return json(200,{schema_version:1,result:await commitRepositoryPackage(ctx.db,cookie(r),{request_id:text(b.request_id),preparation_id:text(b.preparation_id),content_sha256:b.content_sha256,grants:b.grants},ctx.clock)});
},context);}
export function marketplaceCancel(r:Request,context?:HttpContext){return handle(async ctx=>{const b=await input(r,ctx,["preparation_id"]);return json(200,{schema_version:1,result:await cancelPreparation(ctx.db,cookie(r),{request_id:text(b.request_id),preparation_id:text(b.preparation_id)},ctx.clock)});},context);}
export function marketplacePreparation(r:Request,id:string,context?:HttpContext){return handle(async ctx=>{noQuery(r);return json(200,{schema_version:1,...await readPreparation(ctx.db,cookie(r),id,ctx.clock)});},context);}
