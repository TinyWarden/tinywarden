import { randomUUID } from 'node:crypto';
import type { Transaction } from 'kysely';
import type { Database, Hosts } from '../db/types';
import type { Selectable } from 'kysely';
import { authorize, completeAuthorization } from '../access/session';
import { requireAdmin, accessView } from '../access/scope';
import { advanceAccess } from '../access/operator';
import { recordResponseAuthority } from '../access/response-context';
import { commandFingerprint, nextCounter } from '../skills/catalog/package-commands';
import { exactObject, label, sameDigest, uuid } from '../validation';
import { fail, AppError } from '../errors';
import { fleetHostLock } from './control';
import { boundedText, ids, tags, revision, managementRoot, managementFinish, fleetAudit, setMemberships, type FleetDb } from './management';
import {queueUpdate,settleHostUpdates,settleOperationUpdates} from '../agent-updates/requests';
import {validVersion} from '../agent-updates/release';

const kinds=['metadata','membership','maintenance','pause','resume','archive','delete','update'] as const;
type Kind=typeof kinds[number];
type Target={id:string;revision:string};
export function operationInput(raw:Record<string,unknown>){
  exactObject(raw,['request_id','kind','targets','values']);const request=uuid(raw.request_id);
  if(!kinds.includes(raw.kind as Kind)||!Array.isArray(raw.targets)||!raw.targets.length||raw.targets.length>100)fail('invalid_request',400);
  const targets=raw.targets.map(v=>{const x=exactObject(v,['id','revision']);return {id:uuid(x.id),revision:revision(x.revision)};}).sort((a,b)=>a.id.localeCompare(b.id));
  if(new Set(targets.map(t=>t.id)).size!==targets.length)fail('invalid_request',400);
  const kind=raw.kind as Kind;let values:Record<string,unknown>;
  if(kind==='metadata'){
    if(targets.length!==1)fail('invalid_request',400);const v=exactObject(raw.values,['label','description','owner_notes','groups','tags']);
    values={label:label(v.label).trim(),description:boundedText(v.description,2000),owner_notes:boundedText(v.owner_notes,2000),groups:ids(v.groups),tags:tags(v.tags)};
  }else if(kind==='membership'){
    const v=exactObject(raw.values,['add_groups','remove_groups','add_tags','remove_tags']);
    values={add_groups:ids(v.add_groups),remove_groups:ids(v.remove_groups),add_tags:tags(v.add_tags),remove_tags:tags(v.remove_tags)};
    if((values.add_groups as string[]).some(id=>(values.remove_groups as string[]).includes(id))||(values.add_tags as string[]).some(tag=>(values.remove_tags as string[]).includes(tag)))fail('invalid_request',400);
  }else if(kind==='maintenance'){
    const v=exactObject(raw.values,['action','starts_at','ends_at']);if(v.action!=='schedule'&&v.action!=='end')fail('invalid_request',400);
    values={action:v.action,starts_at:v.starts_at===null?null:instant(v.starts_at),ends_at:v.ends_at===null?null:instant(v.ends_at)};
  }else if(kind==='update'){
    const v=exactObject(raw.values,['versions']);if(!Array.isArray(v.versions)||v.versions.length!==targets.length)fail('invalid_request',400);
    const versions=v.versions.map(item=>{const x=exactObject(item,['id','version']);if(x.version!==null&&!validVersion(x.version))fail('invalid_request',400);return {id:uuid(x.id),version:x.version as string|null};}).sort((a,b)=>a.id.localeCompare(b.id));
    if(versions.some((v,i)=>v.id!==targets[i]!.id))fail('invalid_request',400);values={versions};
  }else if(kind==='archive'||kind==='delete'){
    const v=exactObject(raw.values,['preview']);if(typeof v.preview!=='string'||! /^[0-9a-f]{64}$/.test(v.preview))fail('invalid_request',400);values={preview:v.preview};
  }else {exactObject(raw.values,[]);values={};}
  return {request,kind,targets,values};
}
function instant(value:unknown){if(typeof value!=='string')fail('invalid_request',400);const at=new Date(value);if(!Number.isFinite(+at)||at.toISOString()!==value)fail('invalid_request',400);return value;}
function removalDigest(kind:string,targets:Target[],policyRevision:string){return commandFingerprint('fleet_removal',kind,targets,policyRevision).toString('hex');}
export async function removalPreview(db:FleetDb,cookie:string,kind:unknown,targets:Target[],clock:()=>Date){
  if(kind!=='archive'&&kind!=='delete')fail('invalid_request',400);
  const input=operationInput({request_id:targets[0]?.id,kind,targets,values:{preview:'0'.repeat(64)}});
  return db.transaction().execute(async trx=>{
    const actor=await authorize(trx,cookie,clock);requireAdmin(actor);
    const hosts=await trx.selectFrom('hosts').select(['id','label','fleet_revision','lifecycle']).where('id','in',input.targets.map(t=>t.id)).orderBy('id').execute();
    if(hosts.length!==input.targets.length)fail('not_found',404);
    if(hosts.some(h=>h.lifecycle==='deleting'||h.fleet_revision!==input.targets.find(t=>t.id===h.id)!.revision))fail('settings_conflict',409);
    const policy=await trx.selectFrom('data_retention_policy').selectAll().where('singleton','=',true).executeTakeFirstOrThrow();
    await completeAuthorization(trx,actor,clock());
    return {access:accessView(actor),hosts,days:policy.days,policy_revision:policy.revision,preview:removalDigest(kind,input.targets,policy.revision)};
  });
}
export async function resetNotificationBoundary(trx:Transaction<Database>,host:string,at:Date){
  const cursors=trx.selectFrom('notification_cursors').select('id').where('host_id','=',host);
  await trx.updateTable('notification_outbox').set({state:'cancelled',outcome:'fleet_scope_changed',finished_at:at,message_snapshot:null})
    .where('cursor_id','in',cursors).where('state','=','pending').execute();
  await trx.updateTable('notification_cursors').set({current:false,suspended:true}).where('host_id','=',host).where('current','=',true).execute();
}
async function monitoringBoundary(trx:Transaction<Database>,host:Selectable<Hosts>,at:Date){
  const monitoring_epoch=nextCounter(host.monitoring_epoch);
  await trx.updateTable('hosts').set({monitoring_epoch,monitoring_changed_at:at}).where('id','=',host.id).execute();
  await trx.updateTable('skill_manual_runs').set({phase:'failed',reason:'scope_changed',completed_at:at}).where('host_id','=',host.id).where('phase','in',['queued','running']).execute();
  await trx.updateTable('history_subjects').set({suspended:true,continuous_since:null,measured_at:null,facts:null}).where('host_id','=',host.id).execute();
  await resetNotificationBoundary(trx,host.id,at);
  await trx.updateTable('fleet_maintenance').set({closed_at:at}).where('host_id','=',host.id).where('closed_at','is',null).execute();
}
async function applyTarget(trx:Transaction<Database>,actor:string,host:Selectable<Hosts>,kind:Exclude<Kind,"update">,values:Record<string,unknown>,at:Date,operation:string){
  if(host.lifecycle==='deleting')fail('server_deleting',409);
  if(kind==='metadata'){
    await setMemberships(trx,host.id,values.groups as string[],values.tags as string[]);
    await trx.updateTable('hosts').set({label:values.label as string,description:values.description as string,owner_notes:values.owner_notes as string}).where('id','=',host.id).execute();
  }else if(kind==='membership'){
    const groups=(await trx.selectFrom('fleet_group_hosts').select('group_id').where('host_id','=',host.id).execute()).map(g=>g.group_id),labels=(await trx.selectFrom('fleet_host_tags').select('tag').where('host_id','=',host.id).execute()).map(t=>t.tag);
    const newGroups=[...new Set([...groups,...values.add_groups as string[]])].filter(id=>!(values.remove_groups as string[]).includes(id));
    const newTags=[...new Set([...labels,...values.add_tags as string[]])].filter(tag=>!(values.remove_tags as string[]).includes(tag));
    if(newGroups.length>100||newTags.length>20)fail('membership_limit',409);await setMemberships(trx,host.id,newGroups,newTags);
  }else if(kind==='maintenance'){
    if(host.lifecycle!=='active')fail('lifecycle_conflict',409);
    const open=await trx.selectFrom('fleet_maintenance').selectAll().where('host_id','=',host.id).where('closed_at','is',null).forUpdate().executeTakeFirst();
    if(open)await trx.updateTable('fleet_maintenance').set({closed_at:at}).where('id','=',open.id).execute();
    if(values.action==='schedule'){
      const start=values.starts_at===null?at:new Date(values.starts_at as string),end=values.ends_at===null?null:new Date(values.ends_at as string);
      if(+start<+at-300000||end&&end<=start)fail('invalid_maintenance_window',400);
      await trx.insertInto('fleet_maintenance').values({id:randomUUID(),host_id:host.id,starts_at:start,ends_at:end,closed_at:null,created_at:at}).execute();
      if(start<=at)await resetNotificationBoundary(trx,host.id,at);
    }else if(open&&open.starts_at<=at)await resetNotificationBoundary(trx,host.id,at);
  }else{
    if(kind==='pause'){
      if(host.lifecycle!=='active')fail('lifecycle_conflict',409);
      const control=await trx.selectFrom('fleet_agent_control as c').innerJoin('agents as a','a.id','c.agent_id').select('c.reported_at').where('a.host_id','=',host.id).whereRef('c.generation','=','a.current_generation').where('a.revoked_at','is',null).executeTakeFirst();
      if(!control)fail('agent_upgrade_required',409);
    }else if(kind==='resume'&&host.lifecycle!=='paused'||kind==='archive'&&host.lifecycle==='archived')fail('lifecycle_conflict',409);
    else if(kind==='resume'&&host.lifecycle==='archived')fail('restore_required',409);
    await monitoringBoundary(trx,host,at);
    const lifecycle=kind==='pause'?'paused':kind==='resume'?'active':kind==='archive'?'archived':'deleting';
    await trx.updateTable('hosts').set({lifecycle}).where('id','=',host.id).execute();
    if(kind==='archive'||kind==='delete')await settleHostUpdates(trx,{...host,lifecycle},host.id,at);
    if(kind==='archive'||kind==='delete'){
      const agents=trx.selectFrom('agents').select('id').where('host_id','=',host.id);
      await trx.updateTable('agent_credentials').set({revoked_at:at}).where('agent_id','in',agents).where('revoked_at','is',null).execute();
      await trx.updateTable('agents').set({revoked_at:at}).where('host_id','=',host.id).execute();
      await trx.updateTable('enrollment_tokens').set({revoked_at:at}).where('target_agent_id','in',agents).where('revoked_at','is',null).execute();
      if(kind==='delete')await trx.insertInto('fleet_purge_jobs').values({host_id:host.id,operation_id:operation,created_at:at,updated_at:at,error:null}).execute();
      await advanceAccess(trx);
    }
  }
  const next=nextCounter(host.fleet_revision);await trx.updateTable('hosts').set({fleet_revision:next}).where('id','=',host.id).execute();
  await fleetAudit(trx,actor,host.id,kind,at,operation,{revision:next});return next;
}
export async function fleetOperation(db:FleetDb,cookie:string,raw:Record<string,unknown>,clock:()=>Date){
  const input=operationInput(raw),fp=commandFingerprint('fleet_operation',input.kind,input.targets,input.values);
  await db.transaction().execute(async trx=>{
    const actor=await managementRoot(trx,cookie,clock);
    const existing=await trx.selectFrom('fleet_operations').selectAll().where('id','=',input.request).executeTakeFirst();
    if(existing){if(existing.operator_id!==actor.operatorId||!sameDigest(existing.fingerprint,fp))fail('idempotency_conflict',409);return;}
    const hosts=await trx.selectFrom('hosts').select(['id','fleet_revision','lifecycle']).where('id','in',input.targets.map(t=>t.id)).execute();
    if(hosts.length!==input.targets.length)fail('not_found',404);
    if(hosts.some(h=>h.lifecycle==='deleting'||h.fleet_revision!==input.targets.find(t=>t.id===h.id)!.revision))fail('settings_conflict',409);
    let removalPolicyRevision:string|null=null;
    if(input.kind==='archive'||input.kind==='delete'){
      const policy=await trx.selectFrom('data_retention_policy').select('revision').where('singleton','=',true).executeTakeFirstOrThrow();
      if(input.values.preview!==removalDigest(input.kind,input.targets,policy.revision))fail('preview_changed',409);
      removalPolicyRevision=policy.revision;
    }
    await managementFinish(trx,actor,clock);
    await trx.insertInto('fleet_operations').values({id:input.request,operator_id:actor.operatorId,kind:input.kind,payload:{targets:input.targets,values:input.values},removal_policy_revision:removalPolicyRevision,fingerprint:fp,created_at:clock()}).execute();
    await trx.insertInto('fleet_operation_items').values(input.targets.map(t=>({operation_id:input.request,host_id:t.id,expected_revision:t.revision,outcome:null,revision:null,completed_at:null}))).execute();
  });
  await applyPendingTargets(db,cookie,input,clock);
  return readOperation(db,cookie,input.request,clock);
}
async function applyPendingTargets(db:FleetDb,cookie:string,input:ReturnType<typeof operationInput>,clock:()=>Date){
  for(const target of input.targets){
    try{await db.transaction().execute(async trx=>{
      const actor=await managementRoot(trx,cookie,clock);
      const host=await fleetHostLock(trx,target.id);if(!host)fail('not_found',404);
      const item=await trx.selectFrom('fleet_operation_items').selectAll().where('operation_id','=',input.request).where('host_id','=',target.id).forUpdate().executeTakeFirstOrThrow();
      if(item.state!=='pending')return;
      if(input.kind==='update'){
        const existing=await trx.selectFrom('agent_update_requests').select('id').where('operation_id','=',input.request).where('host_id','=',target.id).executeTakeFirst();
        if(existing){await settleHostUpdates(trx,host,host.id,clock());await managementFinish(trx,actor,clock);return;}
      }
      if(host.fleet_revision!==target.revision)fail('settings_conflict',409);
      const at=clock();await managementFinish(trx,actor,clock);
      if(input.kind==='update'){
        const version=(input.values.versions as {id:string;version:string|null}[]).find(v=>v.id===host.id)!.version;
        await queueUpdate(trx,host,input.request,actor.operatorId,version,at);await managementFinish(trx,actor,clock);return;
      }
      if(input.kind==='archive'||input.kind==='delete'){
        const policy=await trx.selectFrom('data_retention_policy').select('revision').where('singleton','=',true).executeTakeFirstOrThrow();
        // Stored only after validating the original full-list preview. Purge may
        // minimize targets without invalidating that consent.
        const operation=await trx.selectFrom('fleet_operations').select('removal_policy_revision').where('id','=',input.request).executeTakeFirstOrThrow();
        if(operation.removal_policy_revision!==policy.revision)fail('preview_changed',409);
      }
      const next=await applyTarget(trx,actor.operatorId,host,input.kind,input.values,at,input.request);
      await managementFinish(trx,actor,clock);
      await trx.updateTable('fleet_operation_items').set({state:'completed',outcome:input.kind==='delete'?'purge_pending':'applied',revision:next,completed_at:at}).where('operation_id','=',input.request).where('host_id','=',target.id).execute();
    });}catch(error){
      if(!(error instanceof AppError)||error.status===401||error.status===403)throw error;
      await db.transaction().execute(async trx=>{const actor=await managementRoot(trx,cookie,clock,false);await managementFinish(trx,actor,clock);
        await trx.updateTable('fleet_operation_items').set({state:error.code==='settings_conflict'?'conflict':'failed',outcome:error.code,completed_at:clock()}).where('operation_id','=',input.request).where('host_id','=',target.id).where('state','=','pending').execute();});
    }
  }

}
export async function readOperation(db:FleetDb,cookie:string,rawId:string,clock:()=>Date){
  const id=uuid(rawId);return db.transaction().execute(async trx=>{
    const actor=await authorize(trx,cookie,clock);requireAdmin(actor);
    const op=await trx.selectFrom('fleet_operations').select(['id','kind']).where('id','=',id).executeTakeFirst();if(!op)fail('not_found',404);
    if(op.kind==='update')await settleOperationUpdates(trx,id,actor.at);
    const items=await trx.selectFrom('fleet_operation_items as i').leftJoin('hosts as h','h.id','i.host_id').selectAll('i').select('h.label as label').where('i.operation_id','=',id).orderBy('i.host_id').limit(100).execute();
    const updates=op.kind==='update'?await trx.selectFrom('agent_update_requests').select(['host_id','target_version','state','error','expires_at']).where('operation_id','=',id).execute():[];
    const purge=await trx.selectFrom('fleet_purge_jobs').selectAll().where('operation_id','=',id).limit(100).execute();
    actor.accessRevision=(await trx.selectFrom('access_control_state').select('revision').where('singleton','=',true).executeTakeFirstOrThrow()).revision;
    recordResponseAuthority(accessView(actor));return {...op,items,purge,updates,access:await managementFinish(trx,actor,clock)};
  });
}

/** Resume the durable, originally authorized intent after a lost connection. */
export async function resumeOperation(db:FleetDb,cookie:string,id:string,clock:()=>Date){
 const request=uuid(id);const raw=await db.transaction().execute(async trx=>{
  const actor=await authorize(trx,cookie,clock);requireAdmin(actor);
  const op=await trx.selectFrom('fleet_operations').selectAll().where('id','=',request).executeTakeFirst();if(!op)fail('not_found',404);
  const pending=await trx.selectFrom('fleet_operation_items').select('host_id').where('operation_id','=',request).where('state','=','pending').limit(1).executeTakeFirst();
  await completeAuthorization(trx,actor,clock());return pending?{request_id:request,kind:op.kind,...op.payload}:null;
 });if(raw)await applyPendingTargets(db,cookie,operationInput(raw),clock);return readOperation(db,cookie,request,clock);
}
