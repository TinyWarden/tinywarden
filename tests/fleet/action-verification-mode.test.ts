import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,it,expect} from 'vitest';
import {lifecycleFixture,resetTestSchema,url} from '../p4a.fixture';
import {actionFixture,readyActionFixture,type AwaitedLifecycle} from './skill-actions.fixture';
import {createMaintenanceOperation} from '../../server/maintenance/operations';
import {agentMaintenance} from '../../server/maintenance/agent';
import {localVerificationSnapshot} from '../../server/maintenance/verification';
import {advanceMaintenance} from '../../server/maintenance/progress';

describe.skipIf(!url)('explicit action verification policy',()=>{
 let f:AwaitedLifecycle;
 beforeEach(async()=>{await resetTestSchema();f=await lifecycleFixture();});
 afterEach(async()=>{await f?.db.destroy();});
 async function applying(local:boolean){
  const source=await actionFixture(f),{input}=await readyActionFixture(f,source);
  const operation=await createMaintenanceOperation(f.db,f.session,input,f.clock);
  let job=await f.db.selectFrom('maintenance_jobs').selectAll().where('operation_id','=',operation.id).executeTakeFirstOrThrow();
  const snapshot=await f.db.transaction().execute(trx=>localVerificationSnapshot(trx,f.hostId,f.clock()));
  const plan=randomUUID(),sha='a'.repeat(64);
  await f.db.insertInto('maintenance_plans').values({id:plan,job_id:job.id,provider_plan:{},verification:snapshot,provider_sha256:sha,verification_sha256:sha,digest:sha,created_at:f.clock(),expires_at:new Date(+f.clock()+300000)}).execute();
  job=await f.db.updateTable('maintenance_jobs').set({phase:'applying',plan_id:plan,apply_attempt:randomUUID(),
   delivered_at:f.clock(),apply_started_at:f.clock(),baseline:snapshot,
   action_snapshot:{...job.action_snapshot!,descriptor:{...job.action_snapshot!.descriptor,...(local?{verification:'local' as const}:{})}}}).where('id','=',job.id).returningAll().executeTakeFirstOrThrow();
  const result={effect:'none' as const,reason:null,local_verified:true,process_running:false,facts:{complete:true,count:0}};
  return {job,result};
 }
 it('completes an explicitly local verified result without unrelated checks or a new heartbeat',async()=>{
  const {job,result}=await applying(true);
  await f.db.updateTable('maintenance_jobs').set({phase:'verifying',result,verification_requested_at:f.clock()}).where('id','=',job.id).execute();
  const next=await f.db.transaction().execute(async trx=>advanceMaintenance(trx,await trx.selectFrom('maintenance_jobs').selectAll().where('id','=',job.id).executeTakeFirstOrThrow(),f.clock()));
  expect(next.phase).toBe('succeeded');expect(next.attention).toBe(false);
  expect(await f.db.selectFrom('maintenance_verification_runs').selectAll().where('job_id','=',job.id).execute()).toEqual([]);
 });
 it('preserves the default post-action platform/contact gate',async()=>{
  const {job,result}=await applying(false);
  await f.db.updateTable('maintenance_jobs').set({phase:'verifying',result,verification_requested_at:f.clock()}).where('id','=',job.id).execute();
  const next=await f.db.transaction().execute(async trx=>advanceMaintenance(trx,await trx.selectFrom('maintenance_jobs').selectAll().where('id','=',job.id).executeTakeFirstOrThrow(),f.clock()));
  expect(next.phase).toBe('verifying');expect(next.completed_at).toBeNull();
 });
 it('never accepts an unverified local result as completion',async()=>{
  const {job,result}=await applying(true);
  await expect(agentMaintenance(f.db,f.agentCredential,{schema_version:2,host_id:f.hostId,agent_id:f.agentId,generation:1,
   job_id:job.id,sequence:1,kind:'verifying',binding:job.action_binding,data:{result:{...result,local_verified:false}}},f.clock)).rejects.toMatchObject({code:'maintenance_result_invalid'});
  expect((await f.db.selectFrom('maintenance_jobs').select('phase').where('id','=',job.id).executeTakeFirstOrThrow()).phase).toBe('applying');
 });
});
