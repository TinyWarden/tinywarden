import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {lifecycleFixture,resetTestSchema,url} from '../p4a.fixture';
import {issueRecovery,revokeRecovery} from '../../server/maintenance/recovery-authority';
import {recoverMaintenance} from '../../server/maintenance/recovery';
import {agentMaintenance} from '../../server/maintenance/agent';
import {controlMaintenance,settleMaintenanceOperation} from '../../server/maintenance/control';
import {pruneMaintenanceBatch,purgeMaintenanceHost} from '../../server/maintenance/job-retention';
import {activeMaintenance} from '../../server/maintenance/fencing';
import {maintenanceRecoveryReceipt} from '../../server/http/maintenance-recovery-handlers';
import type {RecoveryAcceptance,RecoveryFinalization} from '../../lib/maintenance/recovery';

describe.skipIf(!url)('scoped read-only maintenance reconciliation',()=>{
 let f:Awaited<ReturnType<typeof lifecycleFixture>>;
 let actor:string,operation:string,job:string;
 const original={effect:'unknown' as const,reason:'maintenance_worker_interrupted',process_running:true,local_verified:false,facts:{}};
 beforeEach(async()=>{
  await resetTestSchema();f=await lifecycleFixture();operation=randomUUID();job=randomUUID();
  actor=(await f.db.selectFrom('operators').select('id').where('role','=','admin').executeTakeFirstOrThrow()).id;
  await f.db.insertInto('fleet_operations').values({id:operation,operator_id:actor,kind:'maintenance_action',fingerprint:Buffer.alloc(32,1),payload:{},created_at:f.clock()}).execute();
  await f.db.insertInto('fleet_operation_items').values({operation_id:operation,host_id:f.hostId,expected_revision:'1',state:'failed',outcome:original.reason,revision:null,completed_at:f.clock()}).execute();
  await f.db.insertInto('maintenance_jobs').values({id:job,operation_id:operation,host_id:f.hostId,agent_id:f.agentId,generation:1,
   action:'packages.upgrade_conservative.v1',provider_version:1,phase:'failed',attention:true,reason:original.reason,effect:'unknown',process_running:true,
   apply_attempt:randomUUID(),apply_started_at:f.clock(),grant_expires_at:new Date(+f.clock()+60000),plan_id:null,approval_id:null,
   delivered_at:f.clock(),ordinal:0,result:original,created_at:f.clock(),expires_at:new Date(+f.clock()+86400000),updated_at:f.clock(),completed_at:f.clock()}).execute();
 });
 afterEach(async()=>{await f?.db.destroy();});
 const row=()=>f.db.selectFrom('maintenance_jobs').selectAll().where('id','=',job).executeTakeFirstOrThrow();
 async function issue(request=randomUUID()){
  const r=await row();return issueRecovery(f.db,f.session,{request_id:request,operation_id:operation,job_id:job,revision:r.revision},f.clock);
 }
 async function setup(){
  const issued=await issue(),token=issued.token!;
  const accept:RecoveryAcceptance={schema_version:1,scope:issued.scope,local_attempt:issued.scope.apply_attempt,journal_state:'present',
   audit:{boot_id:randomUUID(),integrity:'clean',process_running:false,facts:{state_sha256:'a'.repeat(64),selection_sha256:'b'.repeat(64)}}};
  return {issued,token,accept};
 }
 async function accepted(){
  const state=await setup();const receipt=await recoverMaintenance(f.db,state.token,'accept',state.accept,f.clock);
  const final:RecoveryFinalization={schema_version:1,recovery_id:receipt.recovery_id,acceptance_sha256:receipt.acceptance_sha256!,
   local_release:{job_id:job,local_attempt:state.accept.local_attempt,released:true,audit:state.accept.audit}};
  return {...state,receipt,final};
 }
 it('retains both pending authority and original failure until local release is committed',async()=>{
  const {token,accept,final}=await accepted();
  expect((await row()).recovery_pending).toBe(true);
  expect((await f.db.transaction().execute(trx=>activeMaintenance(trx,f.hostId)))?.id).toBe(job);
  expect(await pruneMaintenanceBatch(f.db,new Date(+f.clock()+86400000))).toBe(0);
  await expect(f.db.transaction().execute(trx=>purgeMaintenanceHost(trx,f.hostId))).rejects.toThrow('purge_maintenance_active');
  expect((await recoverMaintenance(f.db,token,'accept',accept,f.clock)).state).toBe('accepted');
  const reply=await recoverMaintenance(f.db,token,'finalize',final,f.clock);expect(reply.state).toBe('finalized');
  const current=await row();expect(current.result).toEqual(original);expect(current.phase).toBe('failed');
  expect(current.attention).toBe(false);expect(current.process_running).toBe(false);expect(current.cancel_requested).toBe(true);
  expect(await f.db.transaction().execute(trx=>activeMaintenance(trx,f.hostId))).toBeUndefined();
  expect(await pruneMaintenanceBatch(f.db,new Date(+f.clock()+86400000))).toBe(1);
  expect(await f.db.selectFrom('maintenance_recoveries').select('id').execute()).toEqual([]);
  await expect(recoverMaintenance(f.db,token,'finalize',final,f.clock)).rejects.toMatchObject({code:'unauthorized'});
 });
 it('finishes exact committed receipts after expiry, Admin demotion and old credential revocation',async()=>{
  const {token,accept,final,receipt}=await accepted();
  await f.advance(new Date(+f.clock()+900001));
  await f.db.updateTable('operators').set({role:'user',disabled_at:f.clock()}).where('id','=',actor).execute();
  await f.db.updateTable('agent_credentials').set({revoked_at:f.clock()}).where('agent_id','=',f.agentId).execute();
  expect(await recoverMaintenance(f.db,token,'accept',accept,f.clock)).toEqual(receipt);
  expect((await recoverMaintenance(f.db,token,'describe',{schema_version:1},f.clock)).state).toBe('accepted');
  const done=await recoverMaintenance(f.db,token,'finalize',final,f.clock);
  expect(await recoverMaintenance(f.db,token,'finalize',final,f.clock)).toEqual(done);
  await expect(recoverMaintenance(f.db,token,'accept',{...accept,audit:{...accept.audit,boot_id:randomUUID()}},f.clock)).rejects.toMatchObject({code:'idempotency_conflict'});
  await expect(recoverMaintenance(f.db,token,'finalize',{...final,local_release:{...final.local_release,audit:{...final.local_release.audit,boot_id:randomUUID()}}},f.clock)).rejects.toMatchObject({code:'idempotency_conflict'});
 });
 it('rejects unauthorized issue, expired or revoked first acceptance and replaced tokens',async()=>{
  await f.db.updateTable('operators').set({role:'user'}).where('id','=',actor).execute();
  await expect(issue()).rejects.toMatchObject({code:'forbidden'});
  await f.db.updateTable('operators').set({role:'admin'}).where('id','=',actor).execute();
  const expired=await setup();await f.advance(new Date(+f.clock()+900001));
  await expect(recoverMaintenance(f.db,expired.token,'accept',expired.accept,f.clock)).rejects.toMatchObject({code:'maintenance_recovery_expired'});
  const revoked=await setup();await revokeRecovery(f.db,f.session,revoked.issued.recovery_id,f.clock);
  await expect(recoverMaintenance(f.db,revoked.token,'accept',revoked.accept,f.clock)).rejects.toMatchObject({code:'maintenance_recovery_expired'});
  const old=await setup();await issue();
  await expect(recoverMaintenance(f.db,old.token,'accept',old.accept,f.clock)).rejects.toMatchObject({code:'maintenance_recovery_expired'});
 });
 it('rechecks issuing Admin and exact job revision before first acceptance',async()=>{
  const {token,accept}=await setup();
  await f.db.updateTable('operators').set({disabled_at:f.clock()}).where('id','=',actor).execute();
  await expect(recoverMaintenance(f.db,token,'accept',accept,f.clock)).rejects.toMatchObject({code:'maintenance_authority_revoked'});
  await f.db.updateTable('operators').set({disabled_at:null}).where('id','=',actor).execute();
  await f.db.updateTable('maintenance_jobs').set({revision:'99'}).where('id','=',job).execute();
  await expect(recoverMaintenance(f.db,token,'accept',accept,f.clock)).rejects.toMatchObject({code:'maintenance_plan_changed'});
 });
 it('rejects other scope, dirty/running proof, unissued attempts and fabricated orphan consumption',async()=>{
  const {token,accept}=await setup();
  for(const changed of [{scope:{...accept.scope,host_id:randomUUID()}},{scope:{...accept.scope,generation:2}},
   {scope:{...accept.scope,provider_sha256:'c'.repeat(64)}},{local_attempt:randomUUID()},
   {journal_state:'orphan_fence'},{audit:{...accept.audit,process_running:true}},{audit:{...accept.audit,integrity:'dirty'}}]){
   await expect(recoverMaintenance(f.db,token,'accept',{...accept,...changed},f.clock)).rejects.toBeDefined();
  }
  const orphan={...accept,journal_state:'orphan_fence' as const,local_attempt:null};
  expect((await recoverMaintenance(f.db,token,'accept',orphan,f.clock)).state).toBe('accepted');
 });
 it('serializes acceptance/finalization, forbids replacement and protects immutable reports',async()=>{
  const {token,accept,issued}=await setup();
  const replies=await Promise.all([recoverMaintenance(f.db,token,'accept',accept,f.clock),recoverMaintenance(f.db,token,'accept',accept,f.clock)]);
  expect(replies[0]).toEqual(replies[1]);
  await expect(issue()).rejects.toMatchObject({code:'maintenance_reconciliation_required'});
  await expect(revokeRecovery(f.db,f.session,issued.recovery_id,f.clock)).rejects.toMatchObject({code:'maintenance_recovery_committed'});
  await expect(f.db.updateTable('maintenance_recoveries').set({acceptance_sha256:'d'.repeat(64)}).where('id','=',issued.recovery_id).execute()).rejects.toMatchObject({code:'P0001'});
  const final:RecoveryFinalization={schema_version:1,recovery_id:issued.recovery_id,acceptance_sha256:replies[0]!.acceptance_sha256!,
   local_release:{job_id:job,local_attempt:accept.local_attempt,released:true,audit:accept.audit}};
  const done=await Promise.all([recoverMaintenance(f.db,token,'finalize',final,f.clock),recoverMaintenance(f.db,token,'finalize',final,f.clock)]);
  expect(done[0]).toEqual(done[1]);
 });
 it('blocks ordinary event, acknowledgement and sweep shortcuts while pending',async()=>{
  await accepted();const current=await row();
  await expect(agentMaintenance(f.db,f.agentCredential,{schema_version:1,host_id:f.hostId,agent_id:f.agentId,generation:1,job_id:job,sequence:1,kind:'reconciled',data:{result:{...original,local_verified:true,process_running:false}}},f.clock)).rejects.toMatchObject({code:'maintenance_reconciliation_required'});
  await expect(controlMaintenance(f.db,f.session,{request_id:randomUUID(),operation_id:operation,action:'acknowledge',targets:[{job_id:job,revision:current.revision}]},f.clock)).rejects.toMatchObject({code:'maintenance_reconciliation_required'});
  await settleMaintenanceOperation(f.db,f.session,operation,f.clock);
  expect((await row()).attention).toBe(true);
 });
 it('does not expose a secret again on an exact issue retry or accept a token as an agent credential',async()=>{
  const id=randomUUID(),r=await row(),input={request_id:id,operation_id:operation,job_id:job,revision:r.revision};
  const first=await issueRecovery(f.db,f.session,input,f.clock);
  const retry=await issueRecovery(f.db,f.session,input,f.clock);expect(retry.token).toBeNull();expect(retry.recovery_id).toBe(first.recovery_id);
  await f.db.updateTable('agent_credentials').set({revoked_at:f.clock()}).where('agent_id','=',f.agentId).execute();
  const described=await maintenanceRecoveryReceipt(new Request('https://control.test/api/v1/maintenance-recovery/describe',{method:'POST',headers:{authorization:'Bearer '+first.token,'content-type':'application/json'},body:JSON.stringify({schema_version:1})}),'describe',f.ctx);
  expect(described.status).toBe(200);expect((await described.json()).scope).toEqual(first.scope);
  await expect(agentMaintenance(f.db,first.token!,{schema_version:1,host_id:f.hostId,agent_id:f.agentId,generation:1,job_id:job,sequence:0,kind:'poll',data:{}},f.clock)).rejects.toBeDefined();
  const response=await maintenanceRecoveryReceipt(new Request('https://control.test/api/v1/maintenance-recovery/describe',{method:'POST',headers:{authorization:'Bearer wrong','content-type':'application/json'},body:'not-json'}),'describe',f.ctx);
  expect(response.status).toBe(401);
 });
 it('accepts fresh final audit after manual repair without changing original native facts',async()=>{
  const {token,final}=await accepted();
  final.local_release.audit={...final.local_release.audit,boot_id:randomUUID(),facts:{state_sha256:'e'.repeat(64),selection_sha256:'f'.repeat(64)}};
  await recoverMaintenance(f.db,token,'finalize',final,f.clock);
  expect((await row()).result).toEqual(original);
 });
});
