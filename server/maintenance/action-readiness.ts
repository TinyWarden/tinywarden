import type {Transaction} from 'kysely';
import type {Database} from '../db/types';
import type {ActionOriginPermission,ActionReadinessRow,ActionProbe} from '../../lib/skills/action-types';
import {exactObject,uuid} from '../validation';
import {fail} from '../errors';
import {digestText} from './validation';
import {grantedActions} from './package-actions';
import {jsonValue} from '../db/json';

const counter=(v:unknown)=>{if(typeof v!=='string'||!/^[1-9][0-9]{0,15}$/.test(v)||!Number.isSafeInteger(Number(v)))fail('invalid_request',400);return v;};
export function actionPoll(raw:unknown){
 const v=exactObject(raw,['probe_cursor','worker_ready','origins','readiness']);
 if(typeof v.worker_ready!=='boolean'||!Array.isArray(v.origins)||v.origins.length>64||!Array.isArray(v.readiness)||v.readiness.length>32)fail('invalid_request',400);
 const origins:ActionOriginPermission[]=v.origins.map(raw=>{
  const p=exactObject(raw,['github_id','owner_id','classes']);
  if(!Array.isArray(p.classes)||!p.classes.length||p.classes.length>2||new Set(p.classes).size!==p.classes.length||p.classes.some(c=>c!=='unprivileged'&&c!=='host_admin'))fail('invalid_request',400);
  return {github_id:counter(p.github_id),owner_id:counter(p.owner_id),classes:p.classes as ActionOriginPermission['classes']};
 });
 if(new Set(origins.map(p=>p.github_id+':'+p.owner_id)).size!==origins.length)fail('invalid_request',400);
 const readiness:ActionReadinessRow[]=v.readiness.map(raw=>{
  const r=exactObject(raw,['grant_id','installation_id','content_sha256','descriptor_sha256','id','revision','ready','reason','missing']);
  if(typeof r.id!=='string'||!/^[a-z][a-z0-9_.]{1,63}$/.test(r.id)||typeof r.ready!=='boolean'||!Array.isArray(r.missing)||r.missing.length>16||new Set(r.missing).size!==r.missing.length||r.missing.some(p=>typeof p!=='string'||!/^[a-z][a-z0-9_.]{1,63}$/.test(p))||!['action_permission_required','action_prerequisites',null].includes(r.reason as never)||r.ready!==(r.reason===null&&r.missing.length===0))fail('invalid_request',400);
  return {grant_id:uuid(r.grant_id),installation_id:uuid(r.installation_id),content_sha256:digestText(r.content_sha256),descriptor_sha256:digestText(r.descriptor_sha256),id:r.id,revision:counter(r.revision),ready:r.ready,reason:r.reason as string|null,missing:r.missing as string[]};
 });
 if(new Set(readiness.map(r=>r.grant_id)).size!==readiness.length)fail('invalid_request',400);
 return {probe_cursor:v.probe_cursor===null?null:uuid(v.probe_cursor),worker_ready:v.worker_ready,origins,readiness};
}
export async function saveActionPoll(trx:Transaction<Database>,agent:string,generation:string,data:Record<string,unknown>,at:Date){
 const report=actionPoll(data),choices=await grantedActions(trx);
 const legacy=await trx.selectFrom('maintenance_jobs').select('id').where('agent_id','=',agent).where('generation','=',generation)
  .where('action_binding','is',null).where(eb=>eb.or([eb('completed_at','is',null),eb('attention','=',true),eb('recovery_pending','=',true)])).executeTakeFirst();
 if(legacy)fail('maintenance_legacy_recovery_required',409);
 await trx.insertInto('agent_action_workers').values({agent_id:agent,generation,worker_ready:report.worker_ready,origins:jsonValue(report.origins),reported_at:at,cutover_at:at})
  .onConflict(oc=>oc.column('agent_id').doUpdateSet({generation,worker_ready:report.worker_ready,origins:jsonValue(report.origins),reported_at:at})).execute();
 for(const item of report.readiness){
  const choice=choices.find(c=>c.grant_id===item.grant_id);
  if(!choice)continue; // A revoked or replaced grant cannot regain authority from a report.
  if(item.installation_id!==choice.installation_id||item.content_sha256!==choice.content_sha256||item.descriptor_sha256!==choice.snapshot.descriptor_sha256||item.id!==choice.snapshot.descriptor.id||item.revision!==choice.permission_revision)continue;
  if(item.missing.some(p=>!choice.snapshot.descriptor.prerequisites.some(d=>d.id===p)))fail('invalid_request',400);
  await trx.insertInto('agent_action_readiness').values({agent_id:agent,generation,grant_id:item.grant_id,report:item,reported_at:at})
   .onConflict(oc=>oc.columns(['agent_id','grant_id']).doUpdateSet({generation,report:item,reported_at:at})).execute();
 }
 const page=choices.filter(c=>report.probe_cursor===null||c.grant_id>report.probe_cursor).sort((a,b)=>a.grant_id.localeCompare(b.grant_id)).slice(0,33);
 const probes:ActionProbe[]=page.slice(0,32).map(c=>({grant_id:c.grant_id,installation_id:c.installation_id,content_sha256:c.content_sha256,
  descriptor_sha256:c.snapshot.descriptor_sha256,id:c.snapshot.descriptor.id,version:c.snapshot.descriptor.version,revision:c.permission_revision,
  origin:c.origin,execution_class:c.snapshot.descriptor.execution_class,prerequisites:c.snapshot.descriptor.prerequisites}));
 return {probes,...(page.length>32?{next_probe_cursor:probes.at(-1)!.grant_id}:{})};
}
