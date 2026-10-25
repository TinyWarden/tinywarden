import type {Wire} from '@/components/operator/format';
import type {readActionGrants} from '@/server/maintenance/action-grants';
export type ActionGrantRead=Wire<Awaited<ReturnType<typeof readActionGrants>>>&{schema_version:1};
export function validActionGrants(raw:unknown):raw is ActionGrantRead{
 if(!raw||typeof raw!=='object')return false;
 const v=raw as ActionGrantRead;
 return v.schema_version===1&&typeof v.installation_id==='string'&&typeof v.content_sha256==='string'&&Array.isArray(v.actions)&&v.actions.length<=16&&v.actions.every(a=>
  a&&typeof a.enabled==='boolean'&&typeof a.revision==='string'&&(a.grant_id===null||typeof a.grant_id==='string')&&a.snapshot&&a.snapshot.descriptor&&typeof a.snapshot.descriptor.id==='string'&&typeof a.snapshot.descriptor_sha256==='string'&&a.snapshot.schemas?.input&&a.snapshot.catalog&&a.origin&&typeof a.origin.github_id==='string'&&typeof a.origin.owner_id==='string');
}
