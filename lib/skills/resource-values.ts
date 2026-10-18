import type {PackageMetadata,PackageReason,SkillSettings} from "./package-types";
import type {ResourceInventory,ResourceAssessment} from "./resource-types";
import {resourceLimits} from "./resource-types";
const bytes=(v:unknown)=>new TextEncoder().encode(typeof v==="string"?v:JSON.stringify(v)).length;
const wireBytes=(v:unknown)=>JSON.stringify(v).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')).length;
const controls=(value:string)=>Array.from(value).some(c=>{const n=c.codePointAt(0)!;return n<32||n>=127&&n<=159||n>=0xd800&&n<=0xdfff;});
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export const resourceKey=(v:unknown):v is string=>typeof v==="string"&&bytes(v)>=1&&bytes(v)<=255&&!controls(v);
const plain=(v:unknown)=>typeof v==="string"&&bytes(v)<=256&&!controls(v);
export function resourceMessage(v:unknown,m:PackageMetadata):v is PackageReason{
 if(!object(v)||!exact(v,["key","params"])||typeof v.key!=="string"||!object(v.params))return false;
 const entry=m.catalog[v.key];if(!entry||!exact(v.params,Object.keys(entry.parameters)))return false;
 return Object.entries(entry.parameters).every(([k,t])=>{const value=(v.params as Record<string,unknown>)[k];return typeof value===t&&(typeof value!=='string'||Array.from(value).length<=512)&&(typeof value!=='number'||Number.isFinite(value));});
}
export function resourceSelection(m:PackageMetadata,s:SkillSettings):{collection:string;key:string}[]{
 const result:{collection:string;key:string}[]=[];
 for(const [collection,c] of Object.entries(m.manifest.resource_collections??{})){
  const values=s[c.selection_field];
  if(!Array.isArray(values)||values.length>c.max_selected||values.some(v=>!resourceKey(v))||new Set(values).size!==values.length)throw new Error("resource_selection");
  result.push(...values.map(key=>({collection,key})));
 }
 if(result.length>64)throw new Error("resource_selection_limit");return result;
}
export function validResourceInventory(values:unknown,m:PackageMetadata):values is ResourceInventory[]{
 const declared=m.manifest.resource_collections??{};
 if(!Array.isArray(values)||values.length!==Object.keys(declared).length||wireBytes(values)>resourceLimits.inventory)return false;
 const collections=new Set<string>();let total=0;
 for(const v of values){
  if(!object(v)||!exact(v,["collection","complete","reason","items"])||typeof v.collection!=="string"||!Object.hasOwn(declared,v.collection)||collections.has(v.collection)||typeof v.complete!=="boolean"||!Array.isArray(v.items))return false;
  collections.add(v.collection);
  if(v.complete!==(v.reason===null)||v.reason!==null&&!resourceMessage(v.reason,m)||v.items.length>declared[v.collection]!.max_discovered)return false;
  total+=v.items.length;const keys=new Set<string>();
  for(const item of v.items){
   if(!object(item)||!exact(item,["key","label","description","selectable","selection_reason","state"])||!resourceKey(item.key)||keys.has(item.key)||!plain(item.label)||!plain(item.description)||typeof item.selectable!=="boolean")return false;
   keys.add(item.key);
   if(!resourceMessage(item.state,m)||item.selection_reason!==null&&!resourceMessage(item.selection_reason,m)||!item.selectable&&item.selection_reason===null)return false;
  }
 }
 return total<=512;
}
export function validResourceTimeline(values:unknown,m:PackageMetadata,s:SkillSettings,now:number,expires:number):values is ResourceAssessment[]{
 let selected:{collection:string;key:string}[];try{selected=resourceSelection(m,s);}catch{return false;}
 if(!Array.isArray(values)||!values.length||values.length>8||wireBytes(values)>resourceLimits.timeline||now>=expires)return false;
 let previous=now-1;
 for(const [index,entry] of values.entries()){
  if(!object(entry)||!exact(entry,["from","subjects","facts"])||!Number.isSafeInteger(entry.from)||Number(entry.from)<=previous||Number(entry.from)>=expires||index===0&&entry.from!==now||!Array.isArray(entry.facts)||!Array.isArray(entry.subjects)||entry.subjects.length!==selected.length)return false;
  previous=Number(entry.from);const seen=new Set<string>();
  for(const subject of entry.subjects){
   if(!object(subject)||!exact(subject,["collection","key","status","reason","facts"])||!selected.some(v=>v.collection===subject.collection&&v.key===subject.key)||!['healthy','warning','critical','unknown'].includes(String(subject.status))||!resourceMessage(subject.reason,m)||!Array.isArray(subject.facts))return false;
   const identity=JSON.stringify([subject.collection,subject.key]);if(seen.has(identity))return false;seen.add(identity);
  }
 }
 return true;
}
