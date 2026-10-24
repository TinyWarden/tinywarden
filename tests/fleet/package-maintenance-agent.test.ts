import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {lifecycleFixture,resetTestSchema,url} from '../p4a.fixture';
import signed from '../fixtures/remote-update-releases.json';
import fixture from '../fixtures/maintenance-v1.json';
import {verifyRelease} from '../../server/agent-updates/release';
import {createMaintenanceOperation} from '../../server/maintenance/operations';
import {approveMaintenance} from '../../server/maintenance/approvals';
import {controlMaintenance} from '../../server/maintenance/control';
import {agentMaintenance} from '../../server/maintenance/agent';
import {canonicalMaintenance,maintenanceDigest} from '../../server/maintenance/validation';
import {maintenanceActions} from '../../lib/maintenance/policy';
import type {MaintenanceDelivery,MaintenanceAgentRequest} from '../../lib/maintenance/contracts';
import type {PlatformObservation} from '../../lib/agent-updates';
import {assertFleetAction} from '../../server/fleet/action-policy';
import {updatePolicy} from '../../server/agent-updates/agent-api';
import {managementRoot,managementFinish} from '../../server/fleet/management';
import {newCredential} from '../../server/validation';
import {verificationSnapshot} from '../../server/maintenance/verification';
import {sweepMaintenance} from '../../server/maintenance/sweep';

describe.skipIf(!url)('maintenance authenticated coordinator',()=>{
 let f:Awaited<ReturnType<typeof lifecycleFixture>>;
 beforeEach(async()=>{
  await resetTestSchema();f=await lifecycleFixture();
  const release=signed.releases[0]!,metadata=verifyRelease(Buffer.from(release.manifest),release.signature);
  await f.db.updateTable('hosts').set({os_id:'debian',os_version:'13',architecture:'amd64'}).where('id','=',f.hostId).execute();
  await f.db.insertInto('agent_release_catalog').values({version:release.version,manifest:release.manifest,signature:release.signature,metadata,verified_at:f.clock()}).execute();
  await f.db.updateTable('agent_release_catalog_state').set({checked_at:f.clock(),verified_at:f.clock(),error:null}).execute();
  const observation:PlatformObservation={version:metadata.version,installed_version:metadata.version,managed:true,remote_updates:true,local_automatic:false,
   binary_sha256:metadata.binary_sha256,runtime_sha256:metadata.runtime_sha256,descriptor_sha256:metadata.descriptor_sha256,updater:{outcome:'idle'},
   maintenance:{capability:'maintenance_jobs.v1',worker_ready:true,actions:maintenanceActions.map(a=>({id:a.id,ready:true,missing:[]}))}};
  await f.db.insertInto('agent_platform_reports').values({agent_id:f.agentId,generation:1,sequence:1,observed_at:f.clock(),received_at:f.clock(),observation}).execute();
 });
 afterEach(async()=>{await f?.db.destroy();});
 async function create(action='packages.upgrade_conservative.v1'){
  const operation=await createMaintenanceOperation(f.db,f.session,{request_id:randomUUID(),action,targets:[{id:f.hostId,revision:'1'}]},f.clock);
  const job=await f.db.selectFrom('maintenance_jobs').selectAll().where('operation_id','=',operation.id).executeTakeFirstOrThrow();
  return {operation,job};
 }
 function request(job:string|null,sequence=0,kind:MaintenanceAgentRequest['kind']='poll',data:Record<string,unknown>={}):MaintenanceAgentRequest{
  return {schema_version:1,host_id:f.hostId,agent_id:f.agentId,generation:1,job_id:job,sequence,kind,data};
 }
 const send=(v:MaintenanceAgentRequest)=>agentMaintenance(f.db,f.agentCredential,v,f.clock);
 const delivery=(r:Awaited<ReturnType<typeof agentMaintenance>>)=>r.job as MaintenanceDelivery|null;
 async function prepared(){
  const {operation,job}=await create();
  expect(delivery(await send(request(job.id)))?.phase).toBe('preparing');
  const bytes=Buffer.from(canonicalMaintenance(fixture.plan));
  await send(request(job.id,1,'prepared',{provider_sha256:maintenanceDigest(fixture.plan),parts:Math.ceil(bytes.length/32768),age_ms:0}));
  for(let offset=0,part=0;offset<bytes.length;offset+=32768,part++)await send(request(job.id,2+part,'plan_chunk',{
   provider_sha256:maintenanceDigest(fixture.plan),part,total:Math.ceil(bytes.length/32768),content:bytes.subarray(offset,offset+32768).toString('base64')}));
  const row=await f.db.selectFrom('maintenance_jobs').selectAll().where('id','=',job.id).executeTakeFirstOrThrow();
  expect(row.phase).toBe('awaiting_approval');
  const plan=await f.db.selectFrom('maintenance_plans').selectAll().where('job_id','=',job.id).executeTakeFirstOrThrow();
  await approveMaintenance(f.db,f.session,{request_id:randomUUID(),operation_id:operation.id,targets:[{job_id:job.id,plan_id:plan.id,digest:plan.digest}]},f.clock);
  await send(request(job.id,Number(row.last_sequence)+1,'downloading'));
  return {operation,job,next:Number(row.last_sequence)+2};
 }
 it('assembles canonical complete plans, grants once and replays the aged immutable decision',async()=>{
  const {job,next}=await prepared();const input=request(job.id,next,'ready');
  const first=delivery(await send(input));expect(first?.grant).not.toBeNull();expect(first?.phase).toBe('applying');
  await f.advance(new Date(+f.clock()+5000));const retry=await send(input);
  expect(delivery(retry)?.grant).toEqual(first?.grant);expect(retry.server_at).toBe(f.clock().toISOString());
  await expect(send({...input,kind:'cancelled'})).rejects.toMatchObject({code:'idempotency_conflict'});
  expect((await f.db.selectFrom('maintenance_events').selectAll().where('job_id','=',job.id).execute()).filter(e=>e.facts&&e.phase==='applying')).toHaveLength(1);
 });
 it('will not grant after current Admin authority is revoked',async()=>{
  const {operation,job,next}=await prepared();
  const actor=await f.db.selectFrom('fleet_operations').select('operator_id').where('id','=',operation.id).executeTakeFirstOrThrow();
  await f.db.updateTable('operators').set({role:'user'}).where('id','=',actor.operator_id).execute();
  const reply=delivery(await send(request(job.id,next,'ready')));
  expect(reply?.grant).toBeNull();expect(reply?.cancel_requested).toBe(true);
  expect((await f.db.selectFrom('maintenance_jobs').select('apply_attempt').where('id','=',job.id).executeTakeFirstOrThrow()).apply_attempt).toBeNull();
 });
 it('cancels queued intent immediately but delivered intent requires safe acknowledgement',async()=>{
  const {operation,job}=await create();
  await send(request(job.id));
  const current=await f.db.selectFrom('maintenance_jobs').select('revision').where('id','=',job.id).executeTakeFirstOrThrow();
  const control={request_id:randomUUID(),operation_id:operation.id,action:'cancel',targets:[{job_id:job.id,revision:current.revision}]};
  await controlMaintenance(f.db,f.session,control,f.clock);await controlMaintenance(f.db,f.session,control,f.clock);
  await expect(f.db.transaction().execute(trx=>assertFleetAction(trx,{id:f.hostId,lifecycle:'active'},'reconnect',f.clock()))).rejects.toMatchObject({code:'maintenance_cancel_required'});
  expect(delivery(await send(request(job.id,1,'cancelled')))?.phase).toBe('cancelled');
  await expect(f.db.transaction().execute(trx=>assertFleetAction(trx,{id:f.hostId,lifecycle:'active'},'reconnect',f.clock()))).resolves.toBeUndefined();
 });
 it('refuses forged scope, sequence gaps and incomplete plan approval',async()=>{
  const {operation,job}=await create();await send(request(job.id));
  await expect(send({...request(job.id),host_id:randomUUID()})).rejects.toMatchObject({code:'unauthorized'});
  await expect(send(request(job.id,2,'preparing'))).rejects.toMatchObject({code:'maintenance_sequence_conflict'});
  await expect(approveMaintenance(f.db,f.session,{request_id:randomUUID(),operation_id:operation.id,targets:[{job_id:job.id,plan_id:randomUUID(),digest:'a'.repeat(64)}]},f.clock)).rejects.toMatchObject({code:'maintenance_plan_changed'});
 });
 it('strict Refresh succeeds without an upgrade grant, including while monitoring is paused',async()=>{
  await f.db.updateTable('hosts').set({lifecycle:'paused'}).where('id','=',f.hostId).execute();
  const {job}=await create('packages.refresh.v1');await send(request(job.id));
  const result={effect:'indexes_changed',reason:null,local_verified:true,process_running:false,facts:{blocked_subjects:[],blocked_subject_count:0}};
  expect(delivery(await send(request(job.id,1,'completed',{result})))?.phase).toBe('succeeded');
 });
 it('never treats native exit zero as successful upgrade without fresh independent evidence',async()=>{
  const {job,next}=await prepared();await send(request(job.id,next,'ready'));
  const result={effect:'packages_changed',reason:null,local_verified:true,process_running:false,facts:{reboot_required:false,configuration_review:false,services_restart_required:false,kept_back:0,blocked_subjects:[],blocked_subject_count:0}};
  expect(delivery(await send(request(job.id,next+1,'verifying',{result})))?.phase).toBe('verifying');
  await f.advance(new Date(+f.clock()+900001));
  const settled=delivery(await send(request(job.id)));
  expect(settled?.phase).toBe('failed');expect(settled?.attention).toBe(true);
 });
 it('active maintenance blocks automatic update policy and lifecycle at the shared host boundary',async()=>{
  const {job}=await create();await send(request(job.id));
  const policy=await updatePolicy(f.db,f.agentCredential,{schema_version:1,host_id:f.hostId,agent_id:f.agentId,generation:1,version:signed.releases[0]!.version,managed:true},f.clock);
  expect(policy.allowed).toBe(false);
  await expect(f.db.transaction().execute(trx=>assertFleetAction(trx,{id:f.hostId,lifecycle:'active'},'delete',f.clock()))).rejects.toMatchObject({code:'maintenance_cancel_required'});
 });
 it('two concurrent explicit operations acquire only one host mutation reservation',async()=>{
  await Promise.all([1,2].map(()=>createMaintenanceOperation(f.db,f.session,{request_id:randomUUID(),action:'packages.upgrade_conservative.v1',targets:[{id:f.hostId,revision:'1'}]},f.clock)));
  expect(await f.db.selectFrom('maintenance_jobs').select('id').execute()).toHaveLength(1);
  const items=await f.db.selectFrom('fleet_operation_items').select(['state','outcome']).execute();
  expect(items.filter(i=>i.state==='pending')).toHaveLength(1);
  expect(items.find(i=>i.state==='failed')?.outcome).toBe('maintenance_busy');
 });
 it('a concurrent pause and final grant cannot both acquire authority',async()=>{
  const {job,next}=await prepared();
  // Exercise the lifecycle transaction under the same production root/host order.
  await f.db.insertInto('fleet_agent_control').values({agent_id:f.agentId,generation:1,reported_at:f.clock(),applied_epoch:null,applied_at:null}).execute();
  const pause=f.db.transaction().execute(async trx=>{
   const actor=await managementRoot(trx,f.session,f.clock);
   const host=await trx.selectFrom('hosts').selectAll().where('id','=',f.hostId).forUpdate().executeTakeFirstOrThrow();
   await assertFleetAction(trx,host,'pause',f.clock());
   await trx.updateTable('hosts').set({lifecycle:'paused'}).where('id','=',f.hostId).execute();
   await managementFinish(trx,actor,f.clock);
  });
  const outcomes=await Promise.allSettled([pause,send(request(job.id,next,'ready'))]);
  const row=await f.db.selectFrom('maintenance_jobs').selectAll().where('id','=',job.id).executeTakeFirstOrThrow();
  const host=await f.db.selectFrom('hosts').select('lifecycle').where('id','=',f.hostId).executeTakeFirstOrThrow();
  expect(row.apply_attempt!==null&&host.lifecycle==='paused').toBe(false);
  expect(outcomes[1].status).toBe('fulfilled');
 });
 it('keeps the second reviewed host unrunnable when its canary fails',async()=>{
  const host2=randomUUID(),agent2=randomUUID(),credential2=newCredential('agent');
  const host=await f.db.selectFrom('hosts').selectAll().where('id','=',f.hostId).executeTakeFirstOrThrow();
  const agent=await f.db.selectFrom('agents').selectAll().where('id','=',f.agentId).executeTakeFirstOrThrow();
  const credential=await f.db.selectFrom('agent_credentials').selectAll().where('agent_id','=',f.agentId).executeTakeFirstOrThrow();
  const report=await f.db.selectFrom('agent_platform_reports').selectAll().where('agent_id','=',f.agentId).executeTakeFirstOrThrow();
  await f.db.insertInto('hosts').values({...host,id:host2,label:'second'}).execute();
  await f.db.insertInto('agents').values({...agent,id:agent2,host_id:host2}).execute();
  await f.db.insertInto('agent_credentials').values({...credential,id:credential2.id,agent_id:agent2,secret_digest:credential2.digest}).execute();
  await f.db.insertInto('agent_platform_reports').values({...report,agent_id:agent2}).execute();
  const op=await createMaintenanceOperation(f.db,f.session,{request_id:randomUUID(),action:'packages.upgrade_conservative.v1',targets:[{id:f.hostId,revision:'1'},{id:host2,revision:'1'}]},f.clock);
  const jobs=await f.db.selectFrom('maintenance_jobs').selectAll().where('operation_id','=',op.id).orderBy('ordinal').execute();
  const targets=[];
  for(const job of jobs){
   const baseline=await f.db.transaction().execute(trx=>verificationSnapshot(trx,job.host_id,f.clock()));
   const plan=randomUUID(),digest=maintenanceDigest({host:job.host_id});
   await f.db.insertInto('maintenance_plans').values({id:plan,job_id:job.id,provider_plan:fixture.plan,verification:baseline,
    provider_sha256:maintenanceDigest(fixture.plan),verification_sha256:maintenanceDigest(baseline),digest,created_at:f.clock(),expires_at:new Date(+f.clock()+1800000)}).execute();
   await f.db.updateTable('maintenance_jobs').set({phase:'awaiting_approval',delivered_at:f.clock(),plan_id:plan}).where('id','=',job.id).execute();
   targets.push({job_id:job.id,plan_id:plan,digest});
  }
  await approveMaintenance(f.db,f.session,{request_id:randomUUID(),operation_id:op.id,targets},f.clock);
  const second=(sequence=0,kind:MaintenanceAgentRequest['kind']='poll')=>agentMaintenance(f.db,credential2.value,{...request(jobs[1]!.id,sequence,kind),host_id:host2,agent_id:agent2},f.clock);
  expect(delivery(await second())).toBeNull();
  await send(request(jobs[0]!.id,1,'downloading'));await send(request(jobs[0]!.id,2,'ready'));
  const result={effect:'unknown',reason:'maintenance_apply_failed',local_verified:false,process_running:false,facts:{reboot_required:null,configuration_review:null,services_restart_required:null,kept_back:null,blocked_subjects:[],blocked_subject_count:0}};
  await send(request(jobs[0]!.id,3,'failed',{result}));
  expect(delivery(await second())).toBeNull();
  await expect(second(1,'downloading')).rejects.toMatchObject({code:'maintenance_transition_invalid'});
  expect((await f.db.selectFrom('maintenance_jobs').select('apply_attempt').where('id','=',jobs[1]!.id).executeTakeFirstOrThrow()).apply_attempt).toBeNull();
 });
 it('expires undelivered stale intent without claiming a delivered process stopped',async()=>{
  const {job}=await create();await f.advance(new Date(+f.clock()+86400001));
  await sweepMaintenance(f.db,f.clock);
  expect((await f.db.selectFrom('maintenance_jobs').select('phase').where('id','=',job.id).executeTakeFirstOrThrow()).phase).toBe('expired');
 });
 it('keeps a slow applying transaction fenced, accepts late proof and requires explicit attention review',async()=>{
  const {operation,job,next}=await prepared();await send(request(job.id,next,'ready'));
  await f.advance(new Date(+f.clock()+1800001));await sweepMaintenance(f.db,f.clock);
  let row=await f.db.selectFrom('maintenance_jobs').selectAll().where('id','=',job.id).executeTakeFirstOrThrow();
  expect(row.phase).toBe('applying');expect(row.attention).toBe(true);expect(row.process_running).toBe(true);
  const result={effect:'packages_changed',reason:null,local_verified:true,process_running:false,facts:{reboot_required:true,configuration_review:false,services_restart_required:false,kept_back:0,blocked_subjects:[],blocked_subject_count:0}};
  await send(request(job.id,next+1,'verifying',{result}));
  await f.advance(new Date(+f.clock()+1));
  await f.db.updateTable('agent_platform_reports').set({observed_at:f.clock(),received_at:f.clock(),sequence:2}).where('agent_id','=',f.agentId).execute();
  expect(delivery(await send(request(job.id)))?.phase).toBe('succeeded');
  row=await f.db.selectFrom('maintenance_jobs').selectAll().where('id','=',job.id).executeTakeFirstOrThrow();
  expect(row.attention).toBe(true);
  const ack={request_id:randomUUID(),operation_id:operation.id,action:'acknowledge',targets:[{job_id:job.id,revision:row.revision}]};
  await controlMaintenance(f.db,f.session,ack,f.clock);await controlMaintenance(f.db,f.session,ack,f.clock);
  row=await f.db.selectFrom('maintenance_jobs').selectAll().where('id','=',job.id).executeTakeFirstOrThrow();
  expect(row.attention).toBe(false);expect(row.phase).toBe('succeeded');
 });
});
