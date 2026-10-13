import {validateJsonStructure} from "../../http/json-structure";
import {createHash} from "node:crypto";
import {catalogue,repositoryUrl,MAX_CATALOGUE,MAX_ARCHIVE,type CatalogueEntry} from "../../../lib/skills/repositories";
export class RepositoryError extends Error {constructor(readonly code:string,readonly retryAt:Date|null=null){super(code);}}
export interface GithubIdentity {id:string;ownerId:string;name:string;branch:string}
const sha=/^[a-f0-9]{40}$/;
let active=0;
async function slot<T>(run:()=>Promise<T>){if(active>=2)throw new RepositoryError("repository_busy");active++;try{return await run();}finally{active--;}}
function record(v:unknown):Record<string,unknown>{if(!v||typeof v!=="object"||Array.isArray(v))throw new RepositoryError("repository_invalid");return v as Record<string,unknown>;}
function numeric(v:unknown){if(!Number.isSafeInteger(v)||Number(v)<=0)throw new RepositoryError("repository_invalid");return String(v);}
/** Dependency injection is test-only: hosts/redirect validation is always enforced. */
export class GithubClient {
  constructor(private readonly transport:typeof fetch=fetch,private readonly clock:()=>Date=()=>new Date()){}
  private async bytes(url:string,limit:number,signal:AbortSignal,binary=false):Promise<Buffer>{
    let address=new URL(url);
    for(let n=0;n<=3;n++){
      const api=address.hostname==="api.github.com",cdn=["release-assets.githubusercontent.com","objects.githubusercontent.com"].includes(address.hostname);
      if(address.protocol!=="https:"||address.username||address.password||address.port||!api&&!(binary&&cdn))throw new RepositoryError("repository_invalid");
      const response=await this.transport(address,{redirect:"manual",signal,headers:{Accept:binary?"application/octet-stream":"application/vnd.github+json","Accept-Encoding":"identity","X-GitHub-Api-Version":"2022-11-28"}});
      if([301,302,303,307,308].includes(response.status)){
        const location=response.headers.get("location");await response.body?.cancel();if(!location||n===3)throw new RepositoryError("repository_invalid");
        const target=new URL(location,address);
        if(!binary&&(target.hostname!=="api.github.com"||!/^\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/.*)?$/.test(target.pathname)))throw new RepositoryError("repository_invalid");
        address=target;continue;
      }
      if(response.status===429||response.status===403&&response.headers.get("x-ratelimit-remaining")==="0"){
        await response.body?.cancel();
        const after=Number(response.headers.get("retry-after")),reset=Number(response.headers.get("x-ratelimit-reset"));
        const now=this.clock().getTime(),at=Math.min(now+86400000,Math.max(now+60000,after>0?now+after*1000:reset>0?reset*1000:now+3600000));
        throw new RepositoryError("repository_rate_limited",new Date(at));
      }
      if(response.status!==200||!response.body||response.headers.get("content-encoding")&&response.headers.get("content-encoding")!=="identity"){
        await response.body?.cancel();throw new RepositoryError("repository_unavailable");
      }
      const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
      try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>limit)throw new RepositoryError("repository_too_large");chunks.push(next.value);}}
      finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
      return Buffer.concat(chunks);
    }
    throw new RepositoryError("repository_invalid");
  }
  private async json(path:string,signal:AbortSignal,limit=2*1024*1024){
    const raw=await this.bytes(`https://api.github.com/repos/${path}`,limit,signal);
    try{return record(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(raw)));}catch(e){if(e instanceof RepositoryError)throw e;throw new RepositoryError("repository_invalid");}
  }
  private async identity(name:string,signal:AbortSignal,expected?:{id:string;ownerId:string}){
    const v=await this.json(name,signal),owner=record(v.owner);
    if(typeof v.full_name!=="string"||typeof v.default_branch!=="string"||v.default_branch.length>200||v.private!==false)throw new RepositoryError("repository_invalid");
    let actual:string;try{actual=repositoryUrl(`https://github.com/${v.full_name}`);}catch{throw new RepositoryError("repository_invalid");}
    const result:GithubIdentity={id:numeric(v.id),ownerId:numeric(owner.id),name:actual,branch:v.default_branch};
    if(expected&&(result.id!==expected.id||result.ownerId!==expected.ownerId))throw new RepositoryError("repository_identity_changed");
    return result;
  }
  async resolve(name:string){return slot(()=>this.identity(name,AbortSignal.timeout(30000)));}
  async catalogue(name:string,expected:{id:string;ownerId:string}){return slot(async()=>{
    const signal=AbortSignal.timeout(30000),identity=await this.identity(name,signal,expected);
    const commit=await this.json(`${identity.name}/commits/${encodeURIComponent(identity.branch)}`,signal);
    const tree=record(record(commit.commit).tree);
    if(typeof commit.sha!=="string"||!sha.test(commit.sha)||typeof tree.sha!=="string"||!sha.test(tree.sha))throw new RepositoryError("repository_invalid");
    const root=await this.json(`${identity.name}/git/trees/${tree.sha}`,signal);
    if(root.truncated!==false||!Array.isArray(root.tree)||root.tree.length>2000)throw new RepositoryError("repository_invalid");
    const matches=root.tree.filter(v=>record(v).path==="SKILLS.json");
    if(matches.length!==1)throw new RepositoryError("catalogue_missing");
    const entry=record(matches[0]);
    if(entry.type!=="blob"||!["100644","100755"].includes(String(entry.mode))||typeof entry.sha!=="string"||!sha.test(entry.sha))throw new RepositoryError("catalogue_invalid");
    const blob=await this.json(`${identity.name}/git/blobs/${entry.sha}`,signal,MAX_CATALOGUE*2);
    if(blob.encoding!=="base64"||typeof blob.content!=="string"||!Number.isSafeInteger(blob.size)||Number(blob.size)>MAX_CATALOGUE)throw new RepositoryError("catalogue_invalid");
    const raw=Buffer.from(blob.content.replaceAll(/\s/g,""),"base64");
    if(raw.length!==blob.size||raw.length>MAX_CATALOGUE||createHash("sha1").update(`blob ${raw.length}\0`).update(raw).digest("hex")!==entry.sha)throw new RepositoryError("catalogue_invalid");
    let value;try{const text=new TextDecoder("utf-8",{fatal:true}).decode(raw);const parsed=JSON.parse(text);validateJsonStructure(text);value=catalogue(parsed);}catch{throw new RepositoryError("catalogue_invalid");}
    await this.identity(identity.name,signal,expected);
    return {identity,commit:commit.sha,hash:createHash("sha256").update(raw).digest("hex"),catalogue:value};
  });}
  async archive(name:string,expected:{id:string;ownerId:string},entry:CatalogueEntry){return slot(async()=>{
    const signal=AbortSignal.timeout(60000),identity=await this.identity(name,signal,expected);
    const release=await this.json(`${identity.name}/releases/tags/${encodeURIComponent(entry.archive.tag)}`,signal);
    if(release.draft!==false||release.prerelease!==false||release.tag_name!==entry.archive.tag||!Array.isArray(release.assets)||release.assets.length>200)throw new RepositoryError("release_invalid");
    const matches=release.assets.filter(v=>record(v).name===entry.archive.asset);
    if(matches.length!==1)throw new RepositoryError("release_invalid");
    const asset=record(matches[0]),assetId=numeric(asset.id),releaseId=numeric(release.id);
    if(asset.state!=="uploaded"||asset.size!==entry.archive.size)throw new RepositoryError("release_invalid");
    const bytes=await this.bytes(`https://api.github.com/repos/${identity.name}/releases/assets/${assetId}`,MAX_ARCHIVE,signal,true);
    if(bytes.length!==entry.archive.size||createHash("sha256").update(bytes).digest("hex")!==entry.archive.sha256)throw new RepositoryError("archive_mismatch");
    await this.identity(identity.name,signal,expected);
    return {identity,releaseId,assetId,bytes};
  });}
}
