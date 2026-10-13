import type {Wire} from "@/components/operator/format";
import {instant} from "@/components/operator/read-validation";
import {catalogue,object,type RepositoryView} from "@/lib/skills/repositories";
import type {readMarketplace} from "@/server/skills/repositories/catalog";
import type {preparationView} from "@/server/skills/repositories/preparation";
import {messages} from "@/i18n/messages";
export type Marketplace=Wire<Awaited<ReturnType<typeof readMarketplace>>>&{schema_version:1};
export type Offer=Marketplace["offers"][number];
export type Preparation=Wire<ReturnType<typeof preparationView>>;
export type RepositoryList={schema_version:1;as_of:string;repositories:RepositoryView[]};
export function validRepository(r:unknown):r is RepositoryView{return object(r)&&typeof r.id==="string"&&/^[a-f0-9-]{36}$/.test(r.id)&&typeof r.name==="string"&&r.name.length<=150&&typeof r.enabled==="boolean"&&typeof r.official==="boolean"&&typeof r.revision==="string"&&typeof r.catalogue_revision==="string"&&typeof r.count==="number"&&(r.checked_at===null||instant(r.checked_at))&&(r.error===null||typeof r.error==="string");}
export function validRepositories(v:unknown):v is RepositoryList{return object(v)&&v.schema_version===1&&instant(v.as_of)&&Array.isArray(v.repositories)&&v.repositories.length<=20&&v.repositories.every(validRepository);}
export function validMarketplace(v:unknown):v is Marketplace{
  if(!object(v)||!validRepositories(v)||!Array.isArray((v as Record<string,unknown>).offers)||((v as Record<string,unknown>).offers as unknown[]).length>50||!Number.isSafeInteger((v as Record<string,unknown>).total)||Number((v as Record<string,unknown>).total)>4000||!Number.isSafeInteger((v as Record<string,unknown>).page))return false;
  try{return ((v as Record<string,unknown>).offers as unknown[]).every(o=>object(o)&&validRepository(o.repository)&&!!catalogue({format:1,skills:[o.entry]})&&["install","update","connect","current","older","conflict"].includes(String(o.status)));}catch{return false;}
}
export function prepared(value:unknown):{preparation:Preparation|null;error:string|null}{
  if(!object(value)||value.schema_version!==1||!object(value.result))throw Error("invalid_response");
  if(typeof value.result.error==="string")return {preparation:null,error:value.result.error};
  const p=value.result.preparation;
  if(!object(p)||typeof p.id!=="string"||typeof p.repository_id!=="string"||!instant(p.expires_at)||p.state!=="ready"||!object(p.metadata)||!object(p.metadata.manifest)||!object(p.metadata.catalog)||!object(p.origin))throw Error("invalid_response");
  return {preparation:p as unknown as Preparation,error:null};
}
export function repositoryError(code:string|null){return code?(messages.marketplace.errors as Record<string,string>)[code]??messages.marketplace.errors.generic:"";}
