import type {Transaction} from 'kysely';
import type {Database} from '../db/types';
import type {ActionBinding,ActionSnapshot} from '../../lib/skills/action-types';
import {packageText} from '../../lib/skills/package-types';
import {fail} from '../errors';

/** Actions come exclusively from statically admitted immutable package metadata. */
export async function installedActions(trx:Transaction<Database>,id?:string){
 let query=trx.selectFrom('skill_installations as i').innerJoin('skill_packages as p','p.content_sha256','i.content_sha256')
  .leftJoin('skill_installation_sources as s','s.installation_id','i.id')
  .leftJoin('skill_package_origins as o','o.id','s.origin_id')
  .select(['i.id','i.content_sha256','i.enabled','i.settings_revision','i.defaults','i.enablement_version',
   'p.metadata','o.origin','o.content_sha256 as origin_digest','s.kind as source_kind','s.repository_id']);
 if(id)query=query.where('i.id','=',id);
 return (await query.orderBy('i.id').execute()).flatMap(row=>{
  const origin=row.origin;
  if(row.metadata.manifest.sdk!==3||!origin||row.source_kind!=='repository'||
   row.origin_digest!==row.content_sha256||row.repository_id!==origin.repository_id||
   !row.metadata.archive||row.metadata.archive.sha256!==origin.archive_sha256||row.metadata.archive.size!==origin.archive_size)return [];
  return (row.metadata.actions??[]).map(action=>({
   installation_id:row.id,content_sha256:row.content_sha256,enabled:row.enabled,
   skill_name:packageText(row.metadata.catalog,{key:row.metadata.manifest.name_key,params:{}}),
   settings_revision:row.settings_revision,defaults:row.defaults,enablement_version:row.enablement_version,
   archive:row.metadata.archive!,origin:{github_id:origin.github_id,owner_id:origin.owner_id},
   snapshot:{...action,catalog:row.metadata.catalog,skill_id:row.metadata.manifest.id,
    package_version:row.metadata.manifest.version,compatibility:row.metadata.manifest.compatibility} satisfies ActionSnapshot,
  }));
 });
}
export async function grantedActions(trx:Transaction<Database>){
 const definitions=await installedActions(trx);
 if(!definitions.length)return [];
 const grants=await trx.selectFrom('skill_action_grants').selectAll().where('enabled','=',true).execute();
 return definitions.flatMap(definition=>{
  const grant=grants.find(g=>g.installation_id===definition.installation_id&&g.content_sha256===definition.content_sha256&&
   g.action_id===definition.snapshot.descriptor.id&&g.action_version===definition.snapshot.descriptor.version&&
   g.descriptor_sha256===definition.snapshot.descriptor_sha256&&g.origin.github_id===definition.origin.github_id&&g.origin.owner_id===definition.origin.owner_id);
  return grant?[{...definition,grant_id:grant.id,permission_revision:grant.revision,
   name:packageText(definition.snapshot.catalog,{key:definition.snapshot.descriptor.name_key,params:{}}),
   description:packageText(definition.snapshot.catalog,{key:definition.snapshot.descriptor.description_key,params:{}})}]:[];
 });
}
export async function currentBoundAction(trx:Transaction<Database>,binding:ActionBinding){
 const current=(await grantedActions(trx)).find(a=>a.installation_id===binding.installation_id&&
  a.snapshot.descriptor.id===binding.action_id&&a.content_sha256===binding.content_sha256);
 if(!current||!current.enabled||current.permission_revision!==binding.permission_revision||
  current.settings_revision!==binding.settings_revision||current.snapshot.descriptor.version!==binding.action_version||
  current.snapshot.descriptor_sha256!==binding.descriptor_sha256||
  current.origin.github_id!==binding.origin.github_id||current.origin.owner_id!==binding.origin.owner_id)fail('maintenance_authority_revoked',409);
 return current;
}
