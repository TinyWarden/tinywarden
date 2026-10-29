import type {ActionSnapshot} from '@/lib/skills/action-types';
import type {ActionGrantRead} from '@/components/skills/action-model';
import {matchesSchema} from '@/lib/skills/schema-values';
import {partitionSkillAction,type SkillActionTarget} from '@/lib/skills/action-choices';
import {packageText} from '@/lib/skills/package-types';
import type {ActionProgressContext} from '@/lib/maintenance/presentation';

export function actionProgressContext(snapshot:ActionSnapshot,rows:SkillActionTarget[]):ActionProgressContext{
 const d=snapshot.descriptor,name=packageText(snapshot.catalog,{key:d.name_key,params:{}});
 return {name,single:rows.length===1,server:rows.length===1?rows[0]!.label:null,presentation:{name,
  description:packageText(snapshot.catalog,{key:d.description_key,params:{}}),requires_approval:d.requires_approval,
  reason:null,facts:d.result_facts.map(f=>({key:f.key,kind:f.kind,label:packageText(snapshot.catalog,{key:f.label_key,params:{}})}))}};
}

/** Preparation starts directly when there are no inputs. Apply approval is independent. */
export function canStartImmediately(snapshot:ActionSnapshot){
 return snapshot.schemas.input.type==='object'&&
  Object.keys(snapshot.schemas.input.properties??{}).length===0&&matchesSchema(snapshot.schemas.input,{});
}
/** Explicit supplied rows are the entire scope. Never consult the page's bulk selection. */
export function actionStartBody(id:string,action:string,source:ActionGrantRead,choice:ActionGrantRead['actions'][number],rows:SkillActionTarget[],input:unknown){
 return {request_id:id,grant_id:action,content_sha256:source.content_sha256,
  descriptor_sha256:choice.snapshot.descriptor_sha256,permission_revision:choice.revision,
  input_json:JSON.stringify(input),targets:partitionSkillAction(action,rows).eligible.map(row=>({id:row.host_id,revision:row.revision}))};
}
