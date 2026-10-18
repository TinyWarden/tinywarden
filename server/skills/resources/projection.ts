import {type Transaction} from "kysely";
import type {Database} from "../../db/types";
import type {ResourceScope} from "../../db/resource-types";
import {resourceMembers,type ResourceScanScope} from './scan';
import type {PackageProjection} from "../results/package-projection";
import {packageText} from "../../../lib/skills/package-types";
import {evaluationRevision} from "./selection";
import messages from "../../../messages/en.json";
export type ResourceProjection=PackageProjection & ResourceScope & {resource_label?:string};
// Expand only event consumers; fleet/detail consumers retain the aggregate skill.
export async function resourceProjections(trx:Transaction<Database>,values:PackageProjection[],scan?:ResourceScanScope):Promise<ResourceProjection[]>{
 const resource=values.filter(p=>p.metadata.manifest.sdk===2);if(!resource.length)return values;
 const hosts=[...new Set(resource.map(p=>p.host_id))],installations=[...new Set(resource.map(p=>p.installation_id))];
 const members=await resourceMembers(trx,hosts,installations,scan);
 return values.flatMap<ResourceProjection>(p=>{
  if(p.metadata.manifest.sdk!==2)return [p];
  const settings={...p.defaults,...p.overrides},revision=evaluationRevision(p.metadata,settings);
  return members.filter(m=>m.host_id===p.host_id&&m.installation_id===p.installation_id).map(member=>{
   const subject=p.assessment?.subjects?.find(s=>s.collection===member.collection&&s.key===member.resource_key);
   const retired=member.retired_at!==null;
   const assessment=subject&&p.assessment?{from:p.assessment.from,status:subject.status,reason:subject.reason,facts:subject.facts}:null;
   const state:PackageProjection['state']=retired?'disabled':p.state==='disabled'||p.state==='stale'?p.state:subject?.status??'unknown';
   const explanation=retired?messages.resources.monitoringStopped:subject?packageText(p.metadata.catalog,subject.reason):p.reason_text;
   return {...p,resource_collection:member.collection,resource_key:member.resource_key,resource_epoch:member.id,evaluation_revision:revision,
    resource_label:member.label,state,reason:retired?'resource_retired':p.reason,reason_text:explanation,assessment,
    sample_assessment:assessment,source_revision:'1',policy_version:'0',eligible:p.eligible&&!retired,suspend:!retired&&p.suspend,
    facts:{...p.facts,resource:{collection:member.collection,key:member.resource_key,label:member.label},package:{content_sha256:p.content_sha256,name:p.name,observation_id:p.facts.package?.observation_id??null,reason:explanation}},
   };
  });
 });
}
