import type {ActionSnapshot} from '@/lib/skills/action-types';
import type {ActionGrantRead} from '@/components/skills/action-model';
import {matchesSchema} from '@/lib/skills/schema-values';
import {partitionMaintenanceAction} from './maintenance-model';
import {targets,type ServerRow} from './model';
import {packageText} from '@/lib/skills/package-types';
import type {ActionProgressContext} from '@/lib/maintenance/presentation';

export function actionProgressContext(snapshot:ActionSnapshot,rows:ServerRow[]):ActionProgressContext{
 const d=snapshot.descriptor,name=packageText(snapshot.catalog,{key:d.name_key,params:{}});
 return {name,single:rows.length===1,server:rows.length===1?rows[0]!.label:null,presentation:{name,
  description:packageText(snapshot.catalog,{key:d.description_key,params:{}}),requires_approval:d.requires_approval,
  reason:null,facts:d.result_facts.map(f=>({key:f.key,kind:f.kind,label:packageText(snapshot.catalog,{key:f.label_key,params:{}})}))}};
}

/** No extra consent screen for a single-server action that declares no inputs or approval. */
export function canStartImmediately(snapshot:ActionSnapshot){
 return snapshot.descriptor.requires_approval===false&&snapshot.schemas.input.type==='object'&&
  Object.keys(snapshot.schemas.input.properties??{}).length===0&&matchesSchema(snapshot.schemas.input,{});
}
/** Explicit supplied rows are the entire scope. Never consult the page's bulk selection. */
export function actionStartBody(id:string,action:string,source:ActionGrantRead,choice:ActionGrantRead['actions'][number],rows:ServerRow[],input:unknown){
 return {request_id:id,grant_id:action,content_sha256:source.content_sha256,
  descriptor_sha256:choice.snapshot.descriptor_sha256,permission_revision:choice.revision,
  input_json:JSON.stringify(input),targets:targets(partitionMaintenanceAction(action,rows).eligible)};
}
