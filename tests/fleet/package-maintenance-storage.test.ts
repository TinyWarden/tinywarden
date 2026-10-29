import {randomUUID} from 'node:crypto';
import {sql} from 'kysely';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {lifecycleFixture,resetTestSchema,url} from '../p4a.fixture';
import fixture from '../fixtures/maintenance-v1.json';
import {activeMaintenance} from '../../server/maintenance/fencing';
import {pruneMaintenanceBatch,purgeMaintenanceHost} from '../../server/maintenance/job-retention';
import {issueRecovery} from '../../server/maintenance/recovery-authority';
import {recoverMaintenance} from '../../server/maintenance/recovery';
import type {RecoveryAcceptance} from '../../lib/maintenance/recovery';
import {maintenancePurgeTables} from '../../server/maintenance/job-retention';
import {} from '../../server/maintenance/validation';
import {validateUpgradePlan} from '../../server/maintenance/legacy/validation';

describe.skipIf(!url)('durable maintenance storage',()=>{
 let f:Awaited<ReturnType<typeof lifecycleFixture>>;
 beforeEach(async()=>{await resetTestSchema();f=await lifecycleFixture();});
 afterEach(async()=>{await f?.db.destroy();});
 async function job(){
  const operation=randomUUID(),id=randomUUID();
  const actor=await f.db.selectFrom('operators').select('id').where('role','=','admin').executeTakeFirstOrThrow();
  await f.db.insertInto('fleet_operations').values({id:operation,operator_id:actor.id,kind:'maintenance_action',fingerprint:Buffer.alloc(32,1),payload:{},created_at:f.clock()}).execute();
  await f.db.insertInto('fleet_operation_items').values({operation_id:operation,host_id:f.hostId,expected_revision:'1',outcome:null,revision:null,completed_at:null}).execute();
  return f.db.insertInto('maintenance_jobs').values({id,operation_id:operation,host_id:f.hostId,agent_id:f.agentId,generation:'1',action:'packages.upgrade_conservative.v1',provider_version:1,phase:'queued',reason:null,apply_attempt:null,grant_expires_at:null,apply_started_at:null,plan_id:null,approval_id:null,ordinal:0,result:null,created_at:f.clock(),expires_at:new Date(+f.clock()+86400000),updated_at:f.clock(),completed_at:null}).returningAll().executeTakeFirstOrThrow();
 }
 it('keeps uncertainty fenced after expiry and rejects another active host job',async()=>{
  const first=await job();
  await f.db.updateTable('maintenance_jobs').set({phase:'failed',attention:true,effect:'unknown',completed_at:f.clock()}).where('id','=',first.id).execute();
  await f.advance(new Date(+f.clock()+86400001));
  const found=await f.db.transaction().execute(trx=>activeMaintenance(trx,f.hostId));
  expect(found?.id).toBe(first.id);
  await expect(job()).rejects.toMatchObject({code:'23505'});
  await f.db.updateTable('maintenance_jobs').set({attention:false}).where('id','=',first.id).execute();
  expect((await job()).phase).toBe('queued');
 });
 it('rejects an apply phase without an irreversible attempt boundary',async()=>{
  const row=await job();
  await expect(f.db.updateTable('maintenance_jobs').set({phase:'applying'}).where('id','=',row.id).execute()).rejects.toMatchObject({code:'23514'});
  expect((await f.db.selectFrom('maintenance_jobs').select('phase').where('id','=',row.id).executeTakeFirstOrThrow()).phase).toBe('queued');
 });
 it('makes approved plan records immutable and removes dependent details with a job',async()=>{
  const row=await job(),plan=randomUUID();
  await f.db.insertInto('maintenance_plans').values({id:plan,job_id:row.id,provider_plan:validateUpgradePlan(fixture.plan),verification:{policy_sha256:'c'.repeat(64),members:[],not_configured:[]},provider_sha256:fixture.provider_sha256,verification_sha256:'c'.repeat(64),digest:'d'.repeat(64),created_at:f.clock(),expires_at:new Date(+f.clock()+1800000)}).execute();
  await f.db.updateTable('maintenance_jobs').set({plan_id:plan}).where('id','=',row.id).execute();
  await expect(f.db.updateTable('maintenance_plans').set({provider_sha256:'e'.repeat(64)}).where('id','=',plan).execute()).rejects.toMatchObject({code:'P0001'});
  await f.db.deleteFrom('maintenance_jobs').where('id','=',row.id).execute();
  expect(await f.db.selectFrom('maintenance_plans').select('id').where('id','=',plan).execute()).toEqual([]);
 });
 it('refuses false success or a terminal running process without attention',async()=>{
  const row=await job();
  await expect(f.db.updateTable('maintenance_jobs').set({phase:'succeeded',completed_at:f.clock()}).where('id','=',row.id).execute()).rejects.toMatchObject({code:'23514'});
  await expect(f.db.updateTable('maintenance_jobs').set({phase:'failed',completed_at:f.clock(),process_running:true}).where('id','=',row.id).execute()).rejects.toMatchObject({code:'23514'});
 });
 it('keeps active recovery details beyond retention and prunes only after explicit settlement',async()=>{
  const row=await job();
  await f.db.updateTable('maintenance_jobs').set({phase:'failed',attention:true,effect:'unknown',completed_at:f.clock()}).where('id','=',row.id).execute();
  const cutoff=new Date(+f.clock()+86400000);
  expect(await pruneMaintenanceBatch(f.db,cutoff)).toBe(0);
  await expect(f.db.transaction().execute(trx=>purgeMaintenanceHost(trx,f.hostId))).rejects.toThrow('purge_maintenance_active');
  expect(await f.db.selectFrom('maintenance_jobs').select('id').where('id','=',row.id).execute()).toHaveLength(1);
  await f.db.updateTable('maintenance_jobs').set({attention:false}).where('id','=',row.id).execute();
  expect(await pruneMaintenanceBatch(f.db,cutoff)).toBe(1);
  expect(await f.db.selectFrom('maintenance_jobs').select('id').where('id','=',row.id).execute()).toHaveLength(0);
 });

 it('protects and then purges all eight populated families after real recovery settlement',async()=>{
  const row=await job(),plan=randomUUID(),approval=randomUUID(),attempt=randomUUID();
  const actor=(await f.db.selectFrom('operators').select('id').where('role','=','admin').executeTakeFirstOrThrow()).id;
  await f.db.insertInto('maintenance_plans').values({id:plan,job_id:row.id,provider_plan:validateUpgradePlan(fixture.plan),verification:{policy_sha256:'c'.repeat(64),members:[],not_configured:[]},provider_sha256:fixture.provider_sha256,verification_sha256:'c'.repeat(64),digest:'d'.repeat(64),created_at:f.clock(),expires_at:new Date(+f.clock()+1800000)}).execute();
  await f.db.insertInto('maintenance_approvals').values({id:approval,operation_id:row.operation_id,operator_id:actor,fingerprint:Buffer.alloc(32,1),targets:sql<{job_id:string;plan_id:string;digest:string}[]>`${JSON.stringify([{job_id:row.id,plan_id:plan,digest:'d'.repeat(64)}])}::jsonb`,policy_revision:'1',created_at:f.clock()}).execute();
  const original={effect:'unknown' as const,reason:'maintenance_worker_interrupted',local_verified:false,process_running:true,facts:{}};
  await f.db.updateTable('maintenance_jobs').set({phase:'failed',attention:true,process_running:true,effect:'unknown',reason:original.reason,result:original,delivered_at:f.clock(),completed_at:f.clock(),apply_started_at:f.clock(),apply_attempt:attempt,grant_expires_at:new Date(+f.clock()+60000),plan_id:plan,approval_id:approval}).where('id','=',row.id).execute();
  await f.db.insertInto('maintenance_events').values({job_id:row.id,sequence:1,fingerprint:Buffer.alloc(32,1),phase:'failed',facts:{},reply:{},received_at:f.clock()}).execute();
  await f.db.insertInto('maintenance_logs').values({job_id:row.id,sequence:1,record:{sequence:1,phase:'prepare',level:'error',code:'unexpected_exception'},fingerprint:Buffer.alloc(32,1),received_at:f.clock()}).execute();
  await f.db.insertInto('maintenance_plan_parts').values({job_id:row.id,part:0,total:1,provider_sha256:fixture.provider_sha256,content:'e30=',received_at:f.clock()}).execute();
  await f.db.insertInto('maintenance_verification_runs').values({job_id:row.id,installation_id:randomUUID(),stage:'post',manual_run_id:null}).execute();
  const issued=await issueRecovery(f.db,f.session,{request_id:randomUUID(),operation_id:row.operation_id,job_id:row.id,revision:row.revision},f.clock);
  for(const table of maintenancePurgeTables)expect(await f.db.selectFrom(table).selectAll().execute()).toHaveLength(1);
  const cutoff=new Date(+f.clock()+86400000);
  expect(await pruneMaintenanceBatch(f.db,cutoff)).toBe(0);
  await expect(f.db.transaction().execute(trx=>purgeMaintenanceHost(trx,f.hostId))).rejects.toThrow('purge_maintenance_active');
  const acceptance:RecoveryAcceptance={schema_version:1,scope:issued.scope,local_attempt:attempt,journal_state:'present',audit:{boot_id:randomUUID(),integrity:'clean',process_running:false,facts:{state_sha256:'a'.repeat(64),selection_sha256:'b'.repeat(64)}}};
  const accepted=await recoverMaintenance(f.db,issued.token!,'accept',acceptance,f.clock);
  expect(await pruneMaintenanceBatch(f.db,cutoff)).toBe(0);
  await recoverMaintenance(f.db,issued.token!,'finalize',{schema_version:1,recovery_id:issued.recovery_id,acceptance_sha256:accepted.acceptance_sha256!,local_release:{job_id:row.id,local_attempt:attempt,released:true,audit:acceptance.audit}},f.clock);
  const current=await f.db.selectFrom('maintenance_jobs').selectAll().where('id','=',row.id).executeTakeFirstOrThrow();
  expect(current.attention).toBe(false);expect(current.reconciled_at).not.toBeNull();expect(current.result).toEqual(original);
  expect(await pruneMaintenanceBatch(f.db,cutoff)).toBe(1);
  for(const table of maintenancePurgeTables)expect(await f.db.selectFrom(table).selectAll().execute()).toEqual([]);
 });

});
