import {sql,type Kysely,type Transaction} from "kysely";
import type {Database} from "../db/types";
import {compare,validVersion,verifyRelease,repository,type ReleaseManifest,type SignedRelease} from "./release";
type Db=Kysely<Database>|Transaction<Database>;
export interface Catalog {checked_at:Date|null;verified_at:Date|null;error:string|null;releases:Array<SignedRelease&{metadata:ReleaseManifest}>}
export async function readCatalog(db:Db):Promise<Catalog>{
  const [state,releases]=await Promise.all([db.selectFrom("agent_release_catalog_state").selectAll().where("singleton","=",true).executeTakeFirstOrThrow(),db.selectFrom("agent_release_catalog").select(["manifest","signature","metadata"]).limit(257).execute()]);
  if(releases.length>256)throw new Error("catalog_limit");
  return {checked_at:state.checked_at,verified_at:state.verified_at,error:state.error,releases:releases.sort((a,b)=>compare(b.metadata.version,a.metadata.version))};
}
export function freshCatalog(c:Catalog,now:Date){return c.error===null&&c.verified_at!==null&&now.getTime()>=c.verified_at.getTime()&&now.getTime()-c.verified_at.getTime()<24*3600_000;}

async function download(url:string,limit:number,signal:AbortSignal,etag?:string|null){
  let address=new URL(url);
  for(let redirects=0;redirects<4;redirects++){
    const allowed=address.protocol==="https:"&&!address.port&&!address.username&&!address.password&&["github.com","api.github.com","release-assets.githubusercontent.com","objects.githubusercontent.com"].includes(address.hostname);
    if(!allowed)throw new Error("github_unavailable");
    const r=await fetch(address,{redirect:"manual",signal,headers:{Accept:"application/vnd.github+json","Accept-Encoding":"identity",...(etag?{"If-None-Match":etag}:{})}});
    if([301,302,303,307,308].includes(r.status)){const location=r.headers.get("location");await r.body?.cancel();if(!location)throw new Error("github_unavailable");address=new URL(location,address);continue;}
    if(r.status===304)return {bytes:null,etag:r.headers.get("etag")??etag??null};
    if(r.status!==200||r.headers.get("content-encoding")||!r.body){await r.body?.cancel();throw new Error("github_unavailable");}
    const reader=r.body.getReader(),chunks:Uint8Array[]=[];let size=0;
    try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>limit)throw new Error("github_unavailable");chunks.push(next.value);}}
    finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
    return {bytes:Buffer.concat(chunks),etag:r.headers.get("etag")};
  }
  throw new Error("github_unavailable");
}

// No transaction/host lock is held while contacting GitHub. One bounded native job owns refresh.
export async function refreshCatalog(db:Kysely<Database>,now=new Date()){
  const signal=AbortSignal.timeout(120000),state=await db.selectFrom("agent_release_catalog_state").selectAll().where("singleton","=",true).executeTakeFirstOrThrow();
  let tags=state.tags,etag=state.etag;
  try{
    const response=await download(`https://api.github.com/repos/${repository}/releases?per_page=100`,2*1024*1024,signal,etag);
    if(response.bytes){
      const list:unknown=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(response.bytes));
      if(!Array.isArray(list)||list.length>100)throw new Error("github_unavailable");
      tags=list.flatMap(r=>r&&typeof r==="object"&&!r.draft&&!r.prerelease&&typeof r.tag_name==="string"&&r.tag_name.startsWith("v")&&validVersion(r.tag_name.slice(1))?[r.tag_name]:[]);
      tags=[...new Set(tags)].sort((a,b)=>compare(b.slice(1),a.slice(1)));etag=response.etag;
      if(etag&&Buffer.byteLength(etag)>256)etag=null;
    }
    const existing=await db.selectFrom("agent_release_catalog").select("version").execute(),known=new Set(existing.map(r=>r.version));
    if(existing.length>256)throw new Error("catalog_limit");
    const missing=tags.filter(t=>!known.has(t.slice(1)));
    // A bounded scan with unfinished releases cannot claim a verified fresh catalogue.
    const selected=missing.slice(0,16),verified:Array<SignedRelease&{metadata:ReleaseManifest}>=[];
    for(const tag of selected){
      const prefix=`https://github.com/${repository}/releases/download/${tag}`;
      const [manifest,signature]=await Promise.all([download(prefix+"/release.json",16384,signal),download(prefix+"/release.json.sig",256,signal)]);
      if(!manifest.bytes||!signature.bytes)throw new Error("release_invalid");
      const text=new TextDecoder("utf-8",{fatal:true}).decode(manifest.bytes),sig=new TextDecoder("utf-8",{fatal:true}).decode(signature.bytes).trim();
      const metadata=verifyRelease(manifest.bytes,sig);if(metadata.tag!==tag)throw new Error("release_invalid");verified.push({manifest:text,signature:sig,metadata});
    }
    await db.transaction().execute(async trx=>{
      if(existing.length+verified.length>256){
        const references=await trx.selectFrom("agent_platform_reports").select("observation").execute();
        const retain=new Set([...tags.slice(0,100).map(t=>t.slice(1)),...references.flatMap(r=>[r.observation.version,r.observation.installed_version])]);
        const remove=existing.filter(r=>!retain.has(r.version)).map(r=>r.version);
        if(existing.length-remove.length+verified.length>256)throw new Error("catalog_limit");
        if(remove.length)await trx.deleteFrom("agent_release_catalog").where("version","in",remove).execute();
      }
      for(const r of verified)await trx.insertInto("agent_release_catalog").values({version:r.metadata.version,manifest:r.manifest,signature:r.signature,metadata:r.metadata,verified_at:now}).onConflict(c=>c.column("version").doNothing()).execute();
      await trx.updateTable("agent_release_catalog_state").set({checked_at:now,verified_at:missing.length>16?state.verified_at:now,etag,tags:sql`${JSON.stringify(tags)}::jsonb`,error:missing.length>16?"catalog_limit":null}).where("singleton","=",true).execute();
    });
    return {verified:verified.length,complete:missing.length<=16};
  }catch(error){
    const code=error instanceof Error&&["release_invalid","signature_invalid","catalog_limit"].includes(error.message)?error.message==="catalog_limit"?"catalog_limit":"release_invalid":"github_unavailable";
    await db.updateTable("agent_release_catalog_state").set({checked_at:now,error:code}).where("singleton","=",true).execute();return {verified:0,complete:false};
  }
}
