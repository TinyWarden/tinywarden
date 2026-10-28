import type {ActionSnapshot} from '@/lib/skills/action-types';
import type {ActionGrantRead} from '@/components/skills/action-model';
import {matchesSchema} from '@/lib/skills/schema-values';
import {partitionMaintenanceAction} from './maintenance-model';
import {targets,type ServerRow} from './model';

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
