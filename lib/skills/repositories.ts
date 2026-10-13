/** Public catalogue contract; package content and permissions are verified separately. */
export const officialRepository={id:"1415093600",ownerId:"334682923",name:"TinyWarden/tinywarden-skills",key:"d8f5e2ca-2e82-4b27-a6f2-6da42664ca62"};
export const MAX_CATALOGUE=512*1024,MAX_ARCHIVE=10*1024*1024;
export interface CatalogueEntry {id:string;version:string;name:string;description:string;content_sha256:string;archive:{tag:string;asset:string;sha256:string;size:number}}
export interface Catalogue {format:1;skills:CatalogueEntry[]}
export interface RepositoryView {id:string;name:string;url:string;official:boolean;enabled:boolean;removed:boolean;revision:string;catalogue_revision:string;checked_at:string|null;verified_at:string|null;error:string|null;retry_at:string|null;count:number}
export interface InstallationSource {kind:"repository"|"upload"|"local";repository_id:string|null;name:string|null;url:string|null;official:boolean;available:boolean;revision:string}
export function versionCompare(a:string,b:string){const x=a.split(".").map(Number),y=b.split(".").map(Number);for(let n=0;n<3;n++){if(x[n]!==y[n])return x[n]!<y[n]!?-1:1;}return 0;}
export function stableVersion(v:unknown):v is string{return typeof v==="string"&&/^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$/.test(v);}
export function digest(v:unknown):v is string{return typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);}
export function object(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==="object"&&!Array.isArray(v);}
function keys(v:Record<string,unknown>,names:string[]){return Object.keys(v).length===names.length&&names.every(k=>Object.hasOwn(v,k));}
function label(v:unknown,limit:number):v is string{return typeof v==="string"&&v.length>0&&[...v].length<=limit&&![...v].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127);}
export function catalogue(value:unknown):Catalogue{
  if(!object(value)||!keys(value,["format","skills"])||value.format!==1||!Array.isArray(value.skills)||value.skills.length>200)throw Error("catalogue_invalid");
  const seen=new Set<string>();
  for(const v of value.skills){
    if(!object(v)||!keys(v,["id","version","name","description","content_sha256","archive"])||
      typeof v.id!=="string"||!/^[a-z][a-z0-9-]{0,63}\/[a-z][a-z0-9-]{0,63}$/.test(v.id)||seen.has(v.id)||!stableVersion(v.version)||
      !label(v.name,120)||!label(v.description,500)||!digest(v.content_sha256)||!object(v.archive))throw Error("catalogue_invalid");
    const a=v.archive;
    if(!keys(a,["tag","asset","sha256","size"])||typeof a.tag!=="string"||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(a.tag)||
      typeof a.asset!=="string"||a.asset.length>128||!/^[A-Za-z0-9][A-Za-z0-9_.-]*\.zip$/.test(a.asset)||!digest(a.sha256)||
      !Number.isSafeInteger(a.size)||Number(a.size)<1||Number(a.size)>MAX_ARCHIVE)throw Error("catalogue_invalid");
    seen.add(v.id);
  }
  return value as unknown as Catalogue;
}
export function repositoryUrl(raw:unknown){
  if(typeof raw!=="string"||raw.length>300||raw!==raw.trim())throw Error("repository_url_invalid");
  const u=new URL(raw);
  if(!/^https:\/\/github\.com\//i.test(raw)||u.protocol!=="https:"||u.hostname!=="github.com"||u.port||u.username||u.password||u.search||u.hash||raw.includes("%")||raw.includes("\\"))throw Error("repository_url_invalid");
  const match=/^\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9][A-Za-z0-9_.-]{0,99})\/?$/.exec(u.pathname);
  if(!match)throw Error("repository_url_invalid");
  const repo=match[2]!.replace(/\.git$/,"");if(!repo||repo==="."||repo==="..")throw Error("repository_url_invalid");
  return `${match[1]}/${repo}`;
}
