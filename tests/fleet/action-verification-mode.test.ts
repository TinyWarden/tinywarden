import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,it,expect} from 'vitest';
import {lifecycleFixture,resetTestSchema,url} from '../p4a.fixture';
import {actionFixture,readyActionFixture,type AwaitedLifecycle} from './skill-actions.fixture';
import {createMaintenanceOperation} from '../../server/maintenance/operations';
import {agentMaintenance} from '../../server/maintenance/agent';
import {maintenanceMenuStates} from '../../server/maintenance/readiness';
import {localVerificationSnapshot} from '../../server/maintenance/verification';
import {advanceMaintenance,finishMaintenance} from '../../server/maintenance/progress';
import {controlMaintenance} from '../../server/maintenance/control';

describe.skipIf(!url)('explicit action verification policy',()=>{
 let f:AwaitedLifecycle;
 beforeEach(async()=>{await resetTestSchema();f=await lifecycleFixture();});
 afterEach(async()=>{await f?.db.destroy();});
 async function applying(local:boolean){
  const source=await actionFixture(f),{input}=await readyActionFixture(f,source);
  const operation=await createMaintenanceOperation(f.db,f.session,input,f.clock);
  let job=await f.db.selectFrom('maintenance_jobs').selectAll().where('operation_id','=',operation.id).executeTakeFirstOrThrow();
  const snapshot=localVerificationSnapshot(job);
  const plan=randomUUID(),sha='a'.repeat(64);
  await f.db.insertInto('maintenance_plans').values({id:plan,job_id:job.id,provider_plan:{},verification:snapshot,provider_sha256:sha,verification_sha256:sha,digest:sha,created_at:f.clock(),expires_at:new Date(+f.clock()+300000)}).execute();
  job=await f.db.updateTable('maintenance_jobs').set({phase:'applying',plan_id:plan,apply_attempt:randomUUID(),
   delivered_at:f.clock(),apply_started_at:f.clock(),baseline:snapshot,
   action_snapshot:{...job.action_snapshot!,descriptor:{...job.action_snapshot!.descriptor,...(local?{verification:'local' as const}:{})}}}).where('id','=',job.id).returningAll().executeTakeFirstOrThrow();
  const result={effect:'none' as const,reason:null,local_verified:true,process_running:false,facts:{complete:true,count:0}};
  return {job,result,input};
 }
 it('completes an explicitly local verified result without unrelated checks or a new heartbeat',async()=>{
  const {job,result}=await applying(true);
  await f.db.updateTable('maintenance_jobs').set({phase:'verifying',result,verification_requested_at:f.clock()}).where('id','=',job.id).execute();
  const next=await f.db.transaction().execute(async trx=>advanceMaintenance(trx,await trx.selectFrom('maintenance_jobs').selectAll().where('id','=',job.id).executeTakeFirstOrThrow(),f.clock()));
  expect(next.phase).toBe('succeeded');expect(next.attention).toBe(false);
  expect(await f.db.selectFrom('maintenance_verification_runs').selectAll().where('job_id','=',job.id).execute()).toEqual([]);
 });
 it('defaults omitted verification to the skill receipt without a new heartbeat',async()=>{
  const {job,result}=await applying(false);
  await f.db.updateTable('maintenance_jobs').set({phase:'verifying',result,verification_requested_at:f.clock()}).where('id','=',job.id).execute();
  const next=await f.db.transaction().execute(async trx=>advanceMaintenance(trx,await trx.selectFrom('maintenance_jobs').selectAll().where('id','=',job.id).executeTakeFirstOrThrow(),f.clock()));
  expect(next.phase).toBe('succeeded');expect(next.completed_at).not.toBeNull();
 });
 it('never accepts an unverified local result as completion',async()=>{
  const {job,result}=await applying(true);
  await expect(agentMaintenance(f.db,f.agentCredential,{schema_version:2,host_id:f.hostId,agent_id:f.agentId,generation:1,
   job_id:job.id,sequence:1,kind:'verifying',binding:job.action_binding,data:{result:{...result,local_verified:false}}},f.clock)).rejects.toMatchObject({code:'maintenance_result_invalid'});
  await expect(agentMaintenance(f.db,f.agentCredential,{schema_version:2,host_id:f.hostId,agent_id:f.agentId,generation:1,
   job_id:job.id,sequence:1,kind:'verifying',binding:job.action_binding,data:{result:{...result,effect:'unknown'}}},f.clock)).rejects.toMatchObject({code:'maintenance_result_invalid'});
  expect((await f.db.selectFrom('maintenance_jobs').select('phase').where('id','=',job.id).executeTakeFirstOrThrow()).phase).toBe('applying');
 });
 it('retains a verified failure as history while releasing both menus and a new action',async()=>{
  const {job,result,input}=await applying(true),failure={...result,reason:'maintenance_verification_timeout'};
  await f.db.transaction().execute(trx=>finishMaintenance(trx,job,'failed',failure,f.clock(),true));
  const saved=await f.db.selectFrom('maintenance_jobs').selectAll().where('id','=',job.id).executeTakeFirstOrThrow();
  expect(saved.phase).toBe('failed');expect(saved.result).toEqual(failure);expect(saved.attention).toBe(false);
  const host=await f.db.selectFrom('hosts').selectAll().where('id','=',f.hostId).executeTakeFirstOrThrow();
  const menu=await f.db.transaction().execute(async trx=>(await maintenanceMenuStates(trx,[host],f.clock())).get(host.id)!);
  expect(menu.job).toBeNull();expect(menu.actions.some(a=>a.available)).toBe(true);
  const next=await createMaintenanceOperation(f.db,f.session,{...input,request_id:randomUUID()},f.clock);
  expect(await f.db.selectFrom('maintenance_jobs').select('id').where('operation_id','=',next.id).execute()).toHaveLength(1);
 });
 it('releases older verified terminal attention on an authenticated poll without rewriting the failure',async()=>{
  const {job,result}=await applying(true),failure={...result,reason:'maintenance_verification_timeout'};
  await f.db.updateTable('maintenance_jobs').set({phase:'failed',result:failure,attention:true,completed_at:f.clock()}).where('id','=',job.id).execute();
  const reply=await agentMaintenance(f.db,f.agentCredential,{schema_version:2,host_id:f.hostId,agent_id:f.agentId,generation:1,
   job_id:job.id,sequence:0,kind:'poll',binding:job.action_binding,data:{}},f.clock);
  expect(reply.job?.phase).toBe('failed');expect(reply.job?.attention).toBe(false);expect(reply.job?.result).toEqual(failure);
  expect(await f.db.selectFrom('fleet_audit').select('id').where('action','=','maintenance_result_released').execute()).toHaveLength(1);
 });
 it.each([false,true])('keeps uncertain execution fenced, including process_running=%s',async running=>{
  const {job,result,input}=await applying(true),failure={...result,effect:'unknown' as const,reason:'maintenance_worker_interrupted',local_verified:false,process_running:running};
  await f.db.transaction().execute(trx=>finishMaintenance(trx,job,'failed',failure,f.clock()));
  const reply=await agentMaintenance(f.db,f.agentCredential,{schema_version:2,host_id:f.hostId,agent_id:f.agentId,generation:1,
   job_id:job.id,sequence:0,kind:'poll',binding:job.action_binding,data:{}},f.clock);
  expect(reply.job?.attention).toBe(true);expect(reply.job?.result).toEqual(failure);
  const next=await createMaintenanceOperation(f.db,f.session,{...input,request_id:randomUUID()},f.clock);
  expect(await f.db.selectFrom('maintenance_jobs').select('id').where('operation_id','=',next.id).execute()).toHaveLength(0);
  expect((await f.db.selectFrom('fleet_operation_items').select('outcome').where('operation_id','=',next.id).executeTakeFirstOrThrow()).outcome).toBe('maintenance_busy');
 });

 it('refuses acknowledgement of an unknown effect even when it claims local verification',async()=>{
  const {job,result,input}=await applying(true),failure={...result,effect:'unknown' as const,reason:'maintenance_worker_interrupted'};
  await f.db.transaction().execute(trx=>finishMaintenance(trx,job,'failed',failure,f.clock()));
  const saved=await f.db.selectFrom('maintenance_jobs').selectAll().where('id','=',job.id).executeTakeFirstOrThrow();
  await expect(controlMaintenance(f.db,f.session,{request_id:randomUUID(),operation_id:job.operation_id,action:'acknowledge',targets:[{job_id:job.id,revision:saved.revision}]},f.clock)).rejects.toMatchObject({code:'maintenance_reconciliation_required'});
  expect((await f.db.selectFrom('maintenance_jobs').select('attention').where('id','=',job.id).executeTakeFirstOrThrow()).attention).toBe(true);
  const next=await createMaintenanceOperation(f.db,f.session,{...input,request_id:randomUUID()},f.clock);
  expect(await f.db.selectFrom('maintenance_jobs').select('id').where('operation_id','=',next.id).execute()).toHaveLength(0);
 });

 it.each(['known','reconciled','running'] as const)('uses the same acknowledgement proof for %s results',async mode=>{
  const {job,result}=await applying(true),failure={...result,effect:mode==='reconciled'?'unknown' as const:'none' as const,reason:'maintenance_worker_interrupted',local_verified:mode!=='reconciled',process_running:mode==='reconciled'};
  await f.db.updateTable('maintenance_jobs').set({phase:'failed',result:failure,effect:failure.effect,attention:true,process_running:mode==='running',reconciled_at:mode==='reconciled'?f.clock():null,completed_at:f.clock()}).where('id','=',job.id).execute();
  const saved=await f.db.selectFrom('maintenance_jobs').selectAll().where('id','=',job.id).executeTakeFirstOrThrow();
  const command=controlMaintenance(f.db,f.session,{request_id:randomUUID(),operation_id:job.operation_id,action:'acknowledge',targets:[{job_id:job.id,revision:saved.revision}]},f.clock);
  if(mode==='running')await expect(command).rejects.toMatchObject({code:'maintenance_reconciliation_required'});
  else await command;
  const after=await f.db.selectFrom('maintenance_jobs').selectAll().where('id','=',job.id).executeTakeFirstOrThrow();
  expect(after.attention).toBe(mode==='running');expect(after.result).toEqual(failure);
 });

});
