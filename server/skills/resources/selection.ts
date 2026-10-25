import {usesResourceCollections} from '../../../lib/skills/resource-mode';
import {retentionPolicy} from "../../data/retention-policy";
import {resourceContact} from "./contact";
import {createHash,randomUUID} from "node:crypto";
import type {Transaction} from "kysely";
import type {Database} from "../../db/types";
import type {PackageMetadata,SkillSettings} from "../../../lib/skills/package-types";
import {resourceSelection} from "../../../lib/skills/resource-values";
import {canonicalText} from "../catalog/package-commands";
import {fail} from "../../errors";
import {skillEvidenceTime,validSkillEvidenceClock} from "../clock";
export function evaluationRevision(metadata:PackageMetadata,settings:SkillSettings){
 const scalar=Object.fromEntries(Object.entries(settings).filter(([,v])=>!Array.isArray(v)));
 return createHash('sha256').update(canonicalText([metadata.content_sha256,scalar])).digest('hex');
}
export async function resourceEpochs(trx:Transaction<Database>,host:string,installation:string){
 const rows=await trx.selectFrom('skill_resource_memberships').selectAll().where('host_id','=',host).where('installation_id','=',installation).where('retired_at','is',null).execute();
 const result:Record<string,Record<string,string>>={};
 for(const row of rows)(result[row.collection]??={})[row.resource_key]=row.id;
 return result;
}
export async function reconcileSelection(trx:Transaction<Database>,host:string,installation:string,metadata:PackageMetadata,settings:SkillSettings,snapshots:Record<string,string>|undefined,at:Date){
 if(!usesResourceCollections(metadata))return;
 let selected:ReturnType<typeof resourceSelection>;try{selected=resourceSelection(metadata,settings);}catch{fail('invalid_request',400);}
 const active=await trx.selectFrom('skill_resource_memberships').selectAll().where('host_id','=',host).where('installation_id','=',installation).where('retired_at','is',null).execute();
 const cutoff=(await retentionPolicy(trx,at)).cutoff;
 const inventories=await trx.selectFrom('skill_resource_inventories').selectAll().where('host_id','=',host).where('installation_id','=',installation).where('captured_at','>=',cutoff).where('received_at','>=',cutoff).execute();
 const {agent,current}=await resourceContact(trx,host,at);
 const interval=Number(settings.interval_seconds??300),threshold=new Date(at.getTime()-3*interval*1000);
 for(const target of selected){
  if(active.some(r=>r.collection===target.collection&&r.resource_key===target.key))continue;
  const inventory=inventories.find(r=>r.collection===target.collection);
  const item=inventory?.items.find(r=>r.key===target.key);
  if(!inventory||!agent||!current||agent.revoked_at||inventory.agent_id!==agent.id||inventory.generation!==agent.current_generation||inventory.content_sha256!==metadata.content_sha256||!inventory.complete||skillEvidenceTime(+inventory.captured_at,+inventory.received_at)<=+threshold||!validSkillEvidenceClock(+inventory.captured_at,+inventory.received_at,+at)||snapshots?.[target.collection]!==inventory.snapshot_id||!item?.selectable)fail('settings_conflict',409);
  await trx.insertInto('skill_resource_memberships').values({id:randomUUID(),host_id:host,installation_id:installation,collection:target.collection,resource_key:target.key,label:item.label,created_at:at,retired_at:null}).execute();
 }
 for(const row of active)if(!selected.some(s=>s.collection===row.collection&&s.key===row.resource_key))await trx.updateTable('skill_resource_memberships').set({retired_at:at}).where('id','=',row.id).execute();
}
