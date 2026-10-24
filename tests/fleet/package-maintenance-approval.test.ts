import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {lifecycleFixture,resetTestSchema,url} from '../p4a.fixture';
import signed from '../fixtures/remote-update-releases.json';
import fixture from '../fixtures/maintenance-v1.json';
import {verifyRelease} from '../../server/agent-updates/release';
import {createMaintenanceOperation,readMaintenanceOperation} from '../../server/maintenance/operations';
import {approveMaintenance} from '../../server/maintenance/approvals';
import {maintenanceDigest,validateUpgradePlan} from '../../server/maintenance/validation';
import {verificationSnapshot} from '../../server/maintenance/verification';
import {maintenanceActions} from '../../lib/maintenance/policy';
import type {PlatformObservation} from '../../lib/agent-updates';
import {readMaintenancePlan} from '../../server/maintenance/review';
import {consumeAuthority,resetAuthority} from '../../components/operator/authority';
import {activityOptions,operationActivity} from '../../server/fleet/activity';
import {finishMaintenance} from '../../server/maintenance/progress';

describe.skipIf(!url)('maintenance approval authority',()=>{
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
 async function prepared(source=fixture.plan){
  const request={request_id:randomUUID(),action:'packages.upgrade_conservative.v1',targets:[{id:f.hostId,revision:'1'}]};
  const operation=await createMaintenanceOperation(f.db,f.session,request,f.clock);
  await createMaintenanceOperation(f.db,f.session,request,f.clock);
  const job=await f.db.selectFrom('maintenance_jobs').selectAll().where('operation_id','=',operation.id).executeTakeFirstOrThrow();
  const baseline=await f.db.transaction().execute(trx=>verificationSnapshot(trx,f.hostId,f.clock()));
  const provider=validateUpgradePlan(source),providerSHA=maintenanceDigest(provider),plan=randomUUID(),digest=maintenanceDigest({provider_sha256:providerSHA,verification_sha256:maintenanceDigest(baseline)});
  await f.db.insertInto('maintenance_plans').values({id:plan,job_id:job.id,provider_plan:provider,verification:baseline,
   provider_sha256:providerSHA,verification_sha256:maintenanceDigest(baseline),digest,created_at:f.clock(),expires_at:new Date(+f.clock()+1800000)}).execute();
  await f.db.updateTable('maintenance_jobs').set({phase:'awaiting_approval',plan_id:plan}).where('id','=',job.id).execute();
  const approval={request_id:randomUUID(),operation_id:operation.id,targets:[{job_id:job.id,plan_id:plan,digest}]};
  return {job,operation,approval};
 }
 it('enqueues once and approves immutable exact scope with identical replay',async()=>{
  const {job,approval}=await prepared();
  const receipt=await approveMaintenance(f.db,f.session,approval,f.clock);
  expect((await approveMaintenance(f.db,f.session,approval,f.clock)).id).toBe(receipt.id);
  expect(await f.db.selectFrom('maintenance_jobs').select('id').execute()).toHaveLength(1);
  expect(await f.db.selectFrom('maintenance_approvals').select('id').execute()).toHaveLength(1);
  expect((await f.db.selectFrom('maintenance_jobs').selectAll().where('id','=',job.id).executeTakeFirstOrThrow()).phase).toBe('approved');
  await expect(approveMaintenance(f.db,f.session,{...approval,targets:[{...approval.targets[0],digest:'e'.repeat(64)}]},f.clock)).rejects.toMatchObject({code:'idempotency_conflict'});
  await expect(f.db.updateTable('maintenance_approvals').set({policy_revision:'changed'}).where('id','=',receipt.id).execute()).rejects.toMatchObject({code:'P0001'});
 });
 it('returns complete bounded review pages and access authority without leaking executable plans',async()=>{
  const packages=Array.from({length:38},(_,i)=>({...fixture.plan.packages[0]!,name:'example-'+String(i).padStart(3,'0')}));
  const {operation,approval}=await prepared({...fixture.plan,packages,download_bytes:packages.reduce((n,p)=>n+p.archive_bytes,0),unpacked_bytes:packages.reduce((n,p)=>n+p.installed_bytes,0)});
  resetAuthority();expect(consumeAuthority(operation).revision).toMatch(/^[1-9][0-9]*$/);
  const read=await readMaintenanceOperation(f.db,f.session,operation.id,f.clock);
  expect(consumeAuthority(read).account_id).toBe(operation.access.account_id);
  expect(read.items[0]?.review?.tables.find(t=>t.id==='changes')?.count).toBe(38);
  expect(read.items[0]?.digest).toBe(approval.targets[0]!.digest);
  expect(read).not.toHaveProperty('provider_plan');
  const plan=approval.targets[0]!.plan_id;
  const first=await readMaintenancePlan(f.db,f.session,operation.id,plan,'?table=changes&page=1',f.clock);
  const second=await readMaintenancePlan(f.db,f.session,operation.id,plan,'?table=changes&page=2',f.clock);
  expect(consumeAuthority(first).account_id).toBe(operation.access.account_id);
  expect(first.total).toBe(38);expect(first.rows).toHaveLength(25);expect(second.rows).toHaveLength(13);
  expect([...first.rows,...second.rows].map(r=>r.subject)).toEqual(packages.map(p=>p.name));
  expect(first.digest).toBe(second.digest);expect(first).not.toHaveProperty('provider_plan');
  await expect(readMaintenancePlan(f.db,f.session,randomUUID(),plan,'',f.clock)).rejects.toMatchObject({code:'not_found'});
  for(const query of ['?table=changes&page=3','?table=changes&page=1&plan=bad','?table=unknown','?page=1&page=2'])
   await expect(readMaintenancePlan(f.db,f.session,operation.id,plan,query,f.clock)).rejects.toMatchObject({code:'invalid_request'});
  resetAuthority();
 });
 it('keeps terminal uncertain maintenance visible in unfinished Activity',async()=>{
  const {job,operation}=await prepared();
  await f.db.transaction().execute(trx=>finishMaintenance(trx,job,'failed',{effect:'unknown',reason:'maintenance_worker_interrupted',local_verified:false,process_running:false,facts:{}},f.clock(),true));
  const pending=await operationActivity(f.db,f.session,activityOptions('?pending=1','operations'),f.clock);
  expect(pending.operations.some(o=>o.id===operation.id)).toBe(true);
  await f.db.updateTable('maintenance_jobs').set({attention:false}).where('id','=',job.id).execute();
  const done=await operationActivity(f.db,f.session,activityOptions('?pending=1','operations'),f.clock);
  expect(done.operations.some(o=>o.id===operation.id)).toBe(false);
 });
 it('rejects substituted job/plan and changed digest before granting authority',async()=>{
  const {approval}=await prepared();
  for(const target of [{...approval.targets[0],job_id:randomUUID()},{...approval.targets[0],plan_id:randomUUID()},{...approval.targets[0],digest:'e'.repeat(64)}]){
   await expect(approveMaintenance(f.db,f.session,{...approval,targets:[target]},f.clock)).rejects.toMatchObject({code:'maintenance_plan_changed'});
  }
  expect(await f.db.selectFrom('maintenance_approvals').select('id').execute()).toHaveLength(0);
 });
 it('refuses expired plans while other authority remains current',async()=>{
  const {approval}=await prepared();
  await f.advance(new Date(+f.clock()+1800001));
  await f.db.updateTable('agent_platform_reports').set({observed_at:f.clock(),received_at:f.clock()}).where('agent_id','=',f.agentId).execute();
  await expect(approveMaintenance(f.db,f.session,approval,f.clock)).rejects.toMatchObject({code:'maintenance_plan_changed'});
  expect(await f.db.selectFrom('maintenance_approvals').select('id').execute()).toHaveLength(0);
 });
 it('refuses changed credential generation without writing an approval',async()=>{
  const {approval}=await prepared();
  await f.db.updateTable('agents').set({current_generation:'2'}).where('id','=',f.agentId).execute();
  await expect(approveMaintenance(f.db,f.session,approval,f.clock)).rejects.toThrow();
  expect(await f.db.selectFrom('maintenance_approvals').select('id').execute()).toHaveLength(0);
 });
 it('denies a current User all privileged approval and operation reads',async()=>{
  const {operation,approval}=await prepared();
  const actor=await f.db.selectFrom('fleet_operations').select('operator_id').where('id','=',operation.id).executeTakeFirstOrThrow();
  await f.db.updateTable('operators').set({role:'user'}).where('id','=',actor.operator_id).execute();
  try{
   await expect(approveMaintenance(f.db,f.session,approval,f.clock)).rejects.toMatchObject({code:'forbidden'});
   await expect(readMaintenanceOperation(f.db,f.session,operation.id,f.clock)).rejects.toMatchObject({code:'forbidden'});
   await expect(readMaintenancePlan(f.db,f.session,operation.id,approval.targets[0]!.plan_id,'',f.clock)).rejects.toMatchObject({code:'forbidden'});
  }finally{await f.db.updateTable('operators').set({role:'admin'}).where('id','=',actor.operator_id).execute();}
 });
});
