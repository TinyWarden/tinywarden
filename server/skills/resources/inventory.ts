import {retentionPolicy} from "../../data/retention-policy";
import {resourceContact} from "./contact";
import {jsonValue} from "../../db/json";
import {randomUUID} from "node:crypto";
import type {Transaction} from "kysely";
import type {Database} from "../../db/types";
import type {ResourceInventory} from "../../../lib/skills/resource-types";
import type {ResourceItem} from "../../../lib/skills/resource-types";
import type {PackageDb} from "../catalog/package-commands";
import {installed,packageRead} from "../catalog/package-commands";
import {authorize,completeAuthorization} from "../../access/session";
import {requireHostAccess} from "../../access/scope";
import {uuid} from "../../validation";
import {fail} from "../../errors";
import {skillEvidenceTime,validSkillEvidenceClock} from "../clock";
export async function storeInventories(trx:Transaction<Database>,values:ResourceInventory[],scope:{host:string;installation:string;agent:string;generation:string;digest:string;sequence:number;run:string;captured:Date;received:Date}){
 for(const value of values){
  const old=await trx.selectFrom('skill_resource_inventories').selectAll().where('host_id','=',scope.host).where('installation_id','=',scope.installation).where('collection','=',value.collection).executeTakeFirst();
  const failed=!value.complete&&value.items.length===0;
  const row={host_id:scope.host,installation_id:scope.installation,collection:value.collection,snapshot_id:randomUUID(),observation_id:scope.run,agent_id:scope.agent,generation:scope.generation,content_sha256:scope.digest,run_sequence:String(scope.sequence),captured_at:failed&&old?old.captured_at:scope.captured,received_at:scope.received,complete:value.complete,reason:value.reason===null?null:jsonValue(value.reason),items:jsonValue(failed&&old?old.items:value.items)};
  await trx.insertInto('skill_resource_inventories').values(row).onConflict(oc=>oc.columns(['host_id','installation_id','collection']).doUpdateSet(row)).execute();
 }
}
export async function readResources(db:PackageDb,cookie:string,rawHost:string,rawId:string,collection:string,query:{q?:string;monitored?:boolean;page?:number;snapshot?:string;selector?:boolean},clock:()=>Date){
 const host=uuid(rawHost),id=uuid(rawId),q=query.q??'',page=query.page??1;
 if(!/^[a-z][a-z0-9_]{0,63}$/.test(collection)||q.length>128||!Number.isSafeInteger(page)||page<1||page>100)fail('invalid_request',400);
 return packageRead(db,async trx=>{
  const actor=await authorize(trx,cookie,clock);await requireHostAccess(trx,actor,host);
  if(!await trx.selectFrom('hosts').select('id').where('id','=',host).executeTakeFirst())fail('not_found',404);
  const {installation,artifact}=await installed(trx,id);
  const spec=artifact.metadata.manifest.resource_collections?.[collection];if(!spec)fail('not_found',404);
  const cutoff=(await retentionPolicy(trx,actor.at)).cutoff;
  const inventory=await trx.selectFrom('skill_resource_inventories').selectAll().where('host_id','=',host).where('installation_id','=',id).where('collection','=',collection).where('captured_at','>=',cutoff).where('received_at','>=',cutoff).executeTakeFirst();
  if(query.snapshot&&inventory?.snapshot_id!==query.snapshot)fail('settings_conflict',409);
  const memberships=await trx.selectFrom('skill_resource_memberships').selectAll().where('host_id','=',host).where('installation_id','=',id).where('collection','=',collection).where('retired_at','is',null).execute();
  const {agent,current}=await resourceContact(trx,host,actor.at);
  const policy=await trx.selectFrom('host_skill_policies').select('overrides').where('host_id','=',host).where('installation_id','=',id).executeTakeFirst();
  const interval=Number(policy?.overrides.interval_seconds??installation.defaults.interval_seconds??300);
  const fresh=!!inventory&&current&&!!agent&&!agent.revoked_at&&installation.enabled&&inventory.agent_id===agent.id&&inventory.generation===agent.current_generation&&inventory.content_sha256===installation.content_sha256&&validSkillEvidenceClock(+inventory.captured_at,+inventory.received_at,+actor.at)&&+actor.at-skillEvidenceTime(+inventory.captured_at,+inventory.received_at)<interval*3000;
  const rows:Array<Omit<ResourceItem,'state'> & {state:ResourceItem['state']|null;missing?:boolean}>=[...(inventory?.items??[])];
  for(const member of memberships)if(!rows.some(r=>r.key===member.resource_key))rows.push({key:member.resource_key,label:member.label,description:'',selectable:false,selection_reason:null,state:null,missing:true});
  const selected=memberships.map(r=>r.resource_key);
  const filtered=rows.filter(r=>(!query.monitored||selected.includes(r.key))&&(!q||(r.label+' '+r.description).toLowerCase().includes(q.toLowerCase()))).sort((a,b)=>a.label.localeCompare(b.label));
  await completeAuthorization(trx,actor,clock());
  return {schema_version:1,collection,as_of:actor.at.toISOString(),snapshot_id:inventory?.snapshot_id??null,captured_at:inventory?.captured_at.toISOString()??null,fresh,complete:inventory?.complete??false,reason:inventory?.reason??null,selection:selected,total:filtered.length,all_total:rows.length,page,items:query.selector?filtered:filtered.slice((page-1)*10,page*10),metadata:artifact.metadata};
 });
}
