import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,it,expect} from 'vitest';
import {lifecycleFixture,resetTestSchema,url} from '../p4a.fixture';
import {actionFixture,readyActionFixture,type AwaitedLifecycle} from './skill-actions.fixture';
import {setActionGrant,readActionGrants} from '../../server/maintenance/action-grants';
import {agentMaintenance} from '../../server/maintenance/agent';
import {createMaintenanceOperation} from '../../server/maintenance/operations';
import {assertSDK3Scope} from '../../server/skills/catalog/sdk3-compatibility';
import {fetchPackageAssignments} from '../../server/skills/assignments/packages';
import {sdk3Feature} from '../../lib/skills/resource-mode';
import {maintenanceMenuStates} from '../../server/maintenance/readiness';
import {packageText} from '../../lib/skills/package-types';
import {validMaintenanceMenu} from '../../app/fleet/_components/maintenance-model';
import {operationActivity,activityOptions} from '../../server/fleet/activity';
import {detailHost} from '../../server/fleet/inventory';

describe.skipIf(!url)('immutable skill action authority on reserved PostgreSQL',()=>{
 let f:AwaitedLifecycle,source:Awaited<ReturnType<typeof actionFixture>>;
 beforeEach(async()=>{await resetTestSchema();f=await lifecycleFixture();source=await actionFixture(f);});
 afterEach(async()=>{await f?.db.destroy();});
 function grant(enabled=true,revision='0',request=randomUUID()){
  return setActionGrant(f.db,f.session,source.installation,{request_id:request,content_sha256:source.metadata.content_sha256,
   action_id:source.descriptor.descriptor.id,descriptor_sha256:source.descriptor.descriptor_sha256,expected_revision:revision,enabled},f.clock) as Promise<{grant_id:string;revision:string;enabled:boolean}>;
 }
 async function poll(data:Record<string,unknown>){return agentMaintenance(f.db,f.agentCredential,{schema_version:2,host_id:f.hostId,agent_id:f.agentId,generation:1,job_id:null,sequence:0,kind:'poll',data},f.clock);}
 const empty={probe_cursor:null,worker_ready:true,origins:[],readiness:[]};
 it('projects admitted owning-skill labels only for exact permitted actions',async()=>{
  const menu=()=>f.db.transaction().execute(async trx=>{
   const host=await trx.selectFrom('hosts').selectAll().where('id','=',f.hostId).executeTakeFirstOrThrow();
   return (await maintenanceMenuStates(trx,[host],f.clock())).get(host.id)!;
  });
  expect((await menu()).actions).toEqual([]);
  const {approved,input}=await readyActionFixture(f,source),value=await menu(),descriptor=source.descriptor.descriptor;
  expect(value.actions).toEqual([expect.objectContaining({id:approved.grant_id,installation_id:source.installation,
   skill_id:source.metadata.manifest.id,skill_name:packageText(source.metadata.catalog,{key:source.metadata.manifest.name_key,params:{}}),
   action_id:descriptor.id,description:packageText(source.metadata.catalog,{key:descriptor.description_key,params:{}}),available:true})]);
  expect(validMaintenanceMenu(value)).toBe(true);
  const detail=await detailHost(f.db,f.session,f.hostId,f.clock);
  expect(detail.action_target).toEqual({host_id:f.hostId,label:detail.host.label,revision:detail.host.fleet_revision,maintenance_jobs:value});
  const operation=await createMaintenanceOperation(f.db,f.session,input,f.clock);
  const busy=await detailHost(f.db,f.session,f.hostId,f.clock);
  expect(busy.action_target?.maintenance_jobs?.job).toMatchObject({operation_id:operation.id,installation_id:source.installation});
  expect(busy.action_target?.maintenance_jobs?.actions.every(a=>!a.available)).toBe(true);
  await grant(false,'1');expect((await menu()).actions).toEqual([]);
 });
 it('never turns monitor approval or Official source into action permission',async()=>{
  expect((await readActionGrants(f.db,f.session,source.installation,f.clock)).actions[0]!.enabled).toBe(false);
  expect((await poll(empty)).probes).toEqual([]);
  const approved=await grant();
  const reply=await poll(empty);
  expect(reply.probes).toHaveLength(1);expect(reply.probes![0]!.grant_id).toBe(approved.grant_id);
  const monitor=await f.db.selectFrom('skill_installations').select('grants').where('id','=',source.installation).executeTakeFirstOrThrow();
  expect(monitor.grants).toEqual(source.metadata.manifest.capabilities);
 });
 it('uses the saved action snapshot for Fleet and Activity progress even after its grant is revoked',async()=>{
  const {input}=await readyActionFixture(f,source),operation=await createMaintenanceOperation(f.db,f.session,input,f.clock);
  const menu=await f.db.transaction().execute(async trx=>{
   const host=await trx.selectFrom('hosts').selectAll().where('id','=',f.hostId).executeTakeFirstOrThrow();
   return (await maintenanceMenuStates(trx,[host],f.clock())).get(host.id)!;
  });
  const activity=await operationActivity(f.db,f.session,activityOptions('','operations'),f.clock);
  const context=activity.operations.find(o=>o.id===operation.id)!.progress;
  expect(context).toEqual(menu.job!.progress);
  expect(context).toMatchObject({single:true,server:expect.any(String),presentation:{requires_approval:source.descriptor.descriptor.requires_approval}});
  expect(context?.presentation?.name).toBe(packageText(source.metadata.catalog,{key:source.descriptor.descriptor.name_key,params:{}}));
  await grant(false,'1');
  expect((await operationActivity(f.db,f.session,activityOptions('','operations'),f.clock)).operations.find(o=>o.id===operation.id)?.progress).toEqual(context);
 });
 it('pins each new job and refuses a revoked, stale or changed approval',async()=>{
  const approved=await grant(),probe=(await poll(empty)).probes![0]!;
  await poll({...empty,origins:[{...probe.origin,classes:[probe.execution_class]}],readiness:[{
   grant_id:probe.grant_id,installation_id:probe.installation_id,content_sha256:probe.content_sha256,descriptor_sha256:probe.descriptor_sha256,
   id:probe.id,revision:probe.revision,ready:true,reason:null,missing:[]}]});
  const input={request_id:randomUUID(),grant_id:approved.grant_id,content_sha256:probe.content_sha256,descriptor_sha256:probe.descriptor_sha256,
   permission_revision:approved.revision,input_json:'{"complete":true}',targets:[{id:f.hostId,revision:'1'}]};
  const operation=await createMaintenanceOperation(f.db,f.session,input,f.clock);
  const job=await f.db.selectFrom('maintenance_jobs').selectAll().where('operation_id','=',operation.id).executeTakeFirstOrThrow();
  expect(job.action_binding?.content_sha256).toBe(probe.content_sha256);expect(job.action_binding?.origin).toEqual(probe.origin);
  expect(job.input_json).toBe(input.input_json);expect(job.action_snapshot?.descriptor_sha256).toBe(probe.descriptor_sha256);
  const legacy=await agentMaintenance(f.db,f.agentCredential,{schema_version:1,host_id:f.hostId,agent_id:f.agentId,generation:1,job_id:null,sequence:0,kind:'poll',data:{}},f.clock);
  expect(legacy.job).toBeNull();
  expect((await createMaintenanceOperation(f.db,f.session,input,f.clock)).id).toBe(operation.id);
  await grant(false,'1');
  await expect(createMaintenanceOperation(f.db,f.session,{...input,request_id:randomUUID()},f.clock)).rejects.toMatchObject({code:'maintenance_authority_revoked'});
  await expect(grant(true,'1')).rejects.toMatchObject({code:'settings_conflict'});
 });
 it('gives no job to the legacy lane and ignores stale readiness revisions',async()=>{
  const approved=await grant(),probe=(await poll(empty)).probes![0]!;
  await grant(false,'1');await grant(true,'2');
  await poll({...empty,origins:[{...probe.origin,classes:[probe.execution_class]}],readiness:[{
   grant_id:probe.grant_id,installation_id:probe.installation_id,content_sha256:probe.content_sha256,descriptor_sha256:probe.descriptor_sha256,
   id:probe.id,revision:probe.revision,ready:true,reason:null,missing:[]}]});
  const rows=await f.db.selectFrom('agent_action_readiness').selectAll().execute();expect(rows).toHaveLength(0);
  expect(approved.revision).toBe('1');
  const legacy=await agentMaintenance(f.db,f.agentCredential,{schema_version:1,host_id:f.hostId,agent_id:f.agentId,generation:1,job_id:null,sequence:0,kind:'poll',data:{}},f.clock);
  expect(legacy.job).toBeNull();
 });
 it('does not revive a queued intent after disabling and re-enabling its monitor',async()=>{
  const {ready,input}=await readyActionFixture(f,source);
  await createMaintenanceOperation(f.db,f.session,input,f.clock);
  await f.db.updateTable('skill_installations').set({enablement_version:'3'}).where('id','=',source.installation).execute();
  const reply=await agentMaintenance(f.db,f.agentCredential,ready,f.clock);
  expect(reply.job?.phase).toBe('blocked');expect(reply.job?.result?.reason).toBe('maintenance_scope_changed');
 });
 it('refuses the generic-worker cutover while historical work is unfinished',async()=>{
  const operation=randomUUID(),job=randomUUID(),operator=await f.db.selectFrom('operators').select('id').where('role','=','admin').executeTakeFirstOrThrow();
  await f.db.insertInto('fleet_operations').values({id:operation,operator_id:operator.id,kind:'maintenance_action',fingerprint:Buffer.alloc(32),payload:{},created_at:f.clock()}).execute();
  await f.db.insertInto('fleet_operation_items').values({operation_id:operation,host_id:f.hostId,expected_revision:'1',outcome:null,revision:null,completed_at:null}).execute();
  await f.db.insertInto('maintenance_jobs').values({id:job,operation_id:operation,host_id:f.hostId,agent_id:f.agentId,generation:'1',action:'historical.provider.v1',provider_version:1,
   phase:'queued',reason:null,apply_attempt:null,grant_expires_at:null,apply_started_at:null,plan_id:null,approval_id:null,ordinal:0,result:null,created_at:f.clock(),expires_at:new Date(+f.clock()+86400000),updated_at:f.clock(),completed_at:null}).execute();
  await expect(poll(empty)).rejects.toMatchObject({code:'maintenance_legacy_recovery_required'});
  expect(await f.db.selectFrom('agent_action_workers').selectAll().execute()).toHaveLength(0);
 });
 it('withholds an explicit verification-policy package from older SDK3 hosts',async()=>{
  source.metadata.actions![0]!.descriptor.verification='local';
  await f.db.updateTable('skill_packages').set({metadata:source.metadata}).where('content_sha256','=',source.metadata.content_sha256).execute();
  await expect(f.db.transaction().execute(trx=>assertSDK3Scope(trx,source.metadata,f.clock()))).rejects.toMatchObject({code:'maintenance_verification_scope_unsupported'});
  const old=await fetchPackageAssignments(f.db,f.agentCredential,true,f.clock,undefined,[sdk3Feature]);
  expect(old.assignments.find(a=>a.installation_id===source.installation)?.applicability).toBe('unavailable');
 });
 it('holds SDK3 activation until the monitored scope supports it, independently of action grants',async()=>{
  await expect(f.db.transaction().execute(trx=>assertSDK3Scope(trx,source.metadata,f.clock()))).rejects.toMatchObject({code:'maintenance_sdk3_scope_unsupported'});
  const old=await fetchPackageAssignments(f.db,f.agentCredential,true,f.clock);
  expect(old.assignments.find(a=>a.installation_id===source.installation)?.applicability).toBe('unavailable');
  const supported=await fetchPackageAssignments(f.db,f.agentCredential,true,f.clock,undefined,[sdk3Feature]);
  expect(supported.assignments.find(a=>a.installation_id===source.installation)).toMatchObject({package_format:3,resource_mode:false,applicability:'ready'});
  await f.db.transaction().execute(trx=>assertSDK3Scope(trx,source.metadata,f.clock()));
  expect(await f.db.selectFrom('skill_action_grants').selectAll().execute()).toHaveLength(0);
 });
});

describe.skipIf(!url)('package-owned plan and execution on reserved PostgreSQL',()=>{
 let f:AwaitedLifecycle,source:Awaited<ReturnType<typeof actionFixture>>;
 beforeEach(async()=>{await resetTestSchema();f=await lifecycleFixture();source=await actionFixture(f);});
 afterEach(async()=>{await f?.db.destroy();});
 it('requires the reviewed plan and binds replay and final start to the original package',async()=>{
  const approved=await setActionGrant(f.db,f.session,source.installation,{request_id:randomUUID(),content_sha256:source.metadata.content_sha256,
   action_id:source.descriptor.descriptor.id,descriptor_sha256:source.descriptor.descriptor_sha256,expected_revision:'0',enabled:true},f.clock) as {grant_id:string;revision:string};
  await f.db.updateTable('hosts').set({lifecycle:'paused'}).where('id','=',f.hostId).execute();
  const idle={schema_version:2,host_id:f.hostId,agent_id:f.agentId,generation:1,job_id:null,sequence:0,kind:'poll',data:{probe_cursor:null,worker_ready:true,origins:[],readiness:[]}};
  const probe=(await agentMaintenance(f.db,f.agentCredential,idle,f.clock)).probes![0]!;
  const readyIdle={...idle,data:{...idle.data,origins:[{...probe.origin,classes:[probe.execution_class]}],readiness:[{
   grant_id:probe.grant_id,installation_id:probe.installation_id,content_sha256:probe.content_sha256,descriptor_sha256:probe.descriptor_sha256,id:probe.id,revision:probe.revision,ready:true,reason:null,missing:[]}]}};
  await agentMaintenance(f.db,f.agentCredential,readyIdle,f.clock);
  const operation=await createMaintenanceOperation(f.db,f.session,{request_id:randomUUID(),grant_id:approved.grant_id,content_sha256:probe.content_sha256,
   descriptor_sha256:probe.descriptor_sha256,permission_revision:'1',input_json:'{"complete":true}',targets:[{id:f.hostId,revision:'1'}]},f.clock);
  const delivery=(await agentMaintenance(f.db,f.agentCredential,readyIdle,f.clock)).job!;
  expect(delivery.phase).toBe('preparing');expect(delivery.binding?.content_sha256).toBe(probe.content_sha256);
  let sequence=0;
  const send=(kind:string,data:Record<string,unknown>={})=>agentMaintenance(f.db,f.agentCredential,{...idle,job_id:delivery.id,binding:delivery.binding,kind,sequence:++sequence,data},f.clock);
  const invalid={...idle,job_id:delivery.id,binding:delivery.binding,kind:'completed',sequence:1,data:{result:{effect:'none',reason:null,local_verified:true,process_running:false,facts:{complete:true}}}};
  await expect(agentMaintenance(f.db,f.agentCredential,invalid,f.clock)).rejects.toMatchObject({code:'maintenance_transition_invalid'});
  const prepared=await send('preparing');
  expect((await agentMaintenance(f.db,f.agentCredential,{...idle,job_id:delivery.id,binding:delivery.binding,kind:'preparing',sequence:1,data:{}},f.clock)).job?.id).toBe(prepared.job?.id);
  const raw='{"has_changes":true,"plan":{"complete":true},"no_changes_result":null}';
  const digest=(await import('../../server/maintenance/action-values')).bytesDigest(raw);
  await send('prepared',{provider_sha256:digest,parts:1,age_ms:0});
  const reviewed=await send('plan_chunk',{provider_sha256:digest,part:0,total:1,content:Buffer.from(raw).toString('base64')});
  expect(reviewed.job?.phase).toBe('awaiting_approval');
  const row=await f.db.selectFrom('maintenance_jobs').selectAll().where('id','=',delivery.id).executeTakeFirstOrThrow();
  const plan=await f.db.selectFrom('maintenance_plans').selectAll().where('id','=',row.plan_id!).executeTakeFirstOrThrow();
  expect(plan.provider_json).toBe(raw);expect(plan.provider_plan).toEqual({complete:true});expect(plan.verification.mode).toBe('local');
  const {approveMaintenance}=await import('../../server/maintenance/approvals');
  await approveMaintenance(f.db,f.session,{request_id:randomUUID(),operation_id:operation.id,targets:[{job_id:delivery.id,plan_id:plan.id,digest:plan.digest}]},f.clock);
  await send('downloading');
  const request={...idle,job_id:delivery.id,binding:delivery.binding,kind:'ready',sequence:sequence+1,data:{}};
  const grant=await agentMaintenance(f.db,f.agentCredential,request,f.clock),replayed=await agentMaintenance(f.db,f.agentCredential,request,f.clock);
  expect(grant.job?.grant?.attempt_id).toBeTruthy();expect(replayed.job?.grant?.attempt_id).toBe(grant.job?.grant?.attempt_id);
  await expect(agentMaintenance(f.db,f.agentCredential,{...request,binding:{...delivery.binding,permission_revision:'2'}},f.clock)).rejects.toMatchObject({code:'maintenance_scope_changed'});
  await setActionGrant(f.db,f.session,source.installation,{request_id:randomUUID(),content_sha256:source.metadata.content_sha256,
   action_id:source.descriptor.descriptor.id,descriptor_sha256:source.descriptor.descriptor_sha256,expected_revision:'1',enabled:false},f.clock);
  sequence++;
  const verifying=await send('verifying',{result:{effect:'changed',reason:null,local_verified:true,process_running:false,facts:{complete:true}}});
  expect(verifying.job?.phase).toBe('verifying');
  await f.advance(new Date(+f.clock()+1000));
  await f.db.updateTable('agent_platform_reports').set({observed_at:f.clock(),received_at:f.clock()}).where('agent_id','=',f.agentId).execute();
  const finished=await agentMaintenance(f.db,f.agentCredential,{...request,kind:'poll',sequence:0},f.clock);
  expect(finished.job?.phase).toBe('succeeded');expect(finished.job?.result?.facts).toEqual({complete:true});
 });
});
