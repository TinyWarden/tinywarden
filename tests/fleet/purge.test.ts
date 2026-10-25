import {runNotifications} from "../../server/notifications/run";
import {captureHistoricalFixture as runHistory} from "../p4b.fixture";
import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {notificationFixture,url} from '../p4b.fixture';
import {lifecycleFixture,sample} from '../p4a.fixture';
import {removalPreview,fleetOperation,resumeOperation,operationInput} from '../../server/fleet/commands';
import {purgeNextBatch,assertPurgeCoverage} from '../../server/fleet/purge';
import {commandFingerprint} from '../../server/skills/catalog/package-commands';
import {createDb} from '../../server/db/client';
import {controlPoll} from '../../server/fleet/control';
import * as control from '../../server/fleet/control';
import {acknowledgeUncertainty,recoverClaims} from '../../server/notifications/control';
import {claimEvent} from '../../server/notifications/dispatch';
import {sampleFamily} from '../../server/notifications/sampling';
import {notificationAudit} from '../../server/notifications/audit';
import {newCredential} from '../../server/validation';
import {readRetentionSettings,saveRetentionSettings} from '../../server/data/retention-settings';

describe.skipIf(!url)('Permanent Fleet deletion',()=>{
 let f:Awaited<ReturnType<typeof notificationFixture>>;
 beforeEach(async()=>{f=await notificationFixture();});afterEach(async()=>{vi.restoreAllMocks();await f?.db.destroy();});
 async function remove(){
  const current=await f.db.selectFrom('hosts').select('fleet_revision').where('id','=',f.hostId).executeTakeFirstOrThrow();
  const targets=[{id:f.hostId,revision:current.fleet_revision}],preview=await removalPreview(f.db,f.session,'delete',targets,f.clock);
  const input={request_id:randomUUID(),kind:'delete',targets,values:{preview:preview.preview}};
  return {input,result:await fleetOperation(f.db,f.session,input,f.clock)};
 }
 async function finish(host=f.hostId){
  const resumed=createDb(url!);try{
  for(let n=0;n<150;n++){
   const job=await resumed.selectFrom('fleet_purge_jobs').selectAll().where('host_id','=',host).executeTakeFirstOrThrow();
   expect(job.state,JSON.stringify(job)).not.toBe('failed');if(job.state==='completed')return job;
   await purgeNextBatch(resumed,f.clock);
  }throw new Error('purge_did_not_finish');
  }finally{await resumed.destroy();}
 }
 it('purges bounded legacy data and current policy cycles, detaches a shared route and preserves another server',async()=>{
  await f.db.transaction().execute(assertPurgeCoverage);
  for(let n=1;n<=105;n++)await f.diskState(n,90);
  await f.run(sample('package-updates',f.baselines[0]!,f.clock(),1));
  const settings=await f.policy('package-updates');const wire=await settings.json() as {policy_version:number;current_default_revision:number};
  await f.setPolicy('package-updates',wire.policy_version,wire.current_default_revision,'override',{interval_seconds:600,timeout_seconds:30,package_mode:'upgrade'});
  await f.tick();await runHistory(f.db,'tinywarden_test_p1b',f.clock);
  const other=await lifecycleFixture();await other.diskPost(other.disk(1));await other.db.destroy();
  const deletion=await remove();expect(deletion.result.items[0]).toMatchObject({state:'completed',outcome:'purge_pending'});
  expect(await f.db.selectFrom('hosts').select('id').where('id','=',f.hostId).executeTakeFirst()).toBeDefined();
  await expect(f.db.insertInto('fleet_host_tags').values({host_id:f.hostId,tag:'late-worker'}).execute()).rejects.toMatchObject({code:'P0001'});
  await expect(controlPoll(f.db,f.agentCredential,{applied:null},f.clock)).rejects.toMatchObject({code:'unauthorized'});
  for(let n=0;n<3;n++)expect((await purgeNextBatch(f.db,f.clock)).rows).toBeLessThanOrEqual(100);
  // A restart is represented by reopening the owning domain work on the durable stage.
  const job=await finish();expect(Number(job.deleted_rows)).toBeGreaterThan(105);
  expect(await f.db.selectFrom('hosts').select('id').where('id','=',f.hostId).execute()).toHaveLength(0);
  expect(await f.db.selectFrom('disk_runs').select('host_id').execute()).toEqual([{host_id:other.hostId}]);
  expect(await f.db.selectFrom('notification_routes').select('id').execute()).toHaveLength(1);
  expect(await f.db.selectFrom('notification_routes').select('scan_after').executeTakeFirst()).toEqual({scan_after:null});
  expect(await f.db.selectFrom('fleet_audit').select(['action','facts']).where('host_id','=',f.hostId).execute()).toEqual([{action:'delete',facts:{revision:deletion.result.items[0]!.revision}}]);
  const replay=await fleetOperation(f.db,f.session,deletion.input,f.clock);expect(replay.purge[0]!.state).toBe('completed');
  expect(JSON.stringify(await f.db.selectFrom('fleet_operations').select('payload').where('id','=',deletion.input.request_id).executeTakeFirst())).not.toContain(f.hostId);
 });
 it('keeps a fence across retries and suppresses held worker snapshots after deletion',async()=>{
  await f.diskState(1);await f.enqueue();const event=(await f.events())[0]!;
  const {claimEvent,finishEvent}=await import('../../server/notifications/dispatch');
  const held=await claimEvent(f.db,event,f.settings,f.clock);expect(held).not.toBeNull();
  await remove();await finish();
  await expect(finishEvent(f.db,held!.event,{kind:'captured',code:'capture_only'},f.clock)).resolves.toBeUndefined();
  expect(await claimEvent(f.db,event,f.settings,f.clock)).toBeNull();
  expect(await f.db.selectFrom('notification_outbox').select('id').execute()).toHaveLength(0);
 });
 it('minimizes a deleted target from a partial bulk intent and resumes only its surviving pending target',async()=>{
  const other=await lifecycleFixture();await other.db.destroy();
  const request=randomUUID(),input=operationInput({request_id:request,kind:'membership',targets:[{id:f.hostId,revision:'1'},{id:other.hostId,revision:'1'}],values:{add_groups:[],remove_groups:[],add_tags:['production'],remove_tags:[]}});
  const actor=await f.db.selectFrom('operators').select('id').where('recovery_admin','=',true).executeTakeFirstOrThrow();
  await f.db.insertInto('fleet_operations').values({id:request,operator_id:actor.id,kind:input.kind,fingerprint:commandFingerprint('fleet_operation',input.kind,input.targets,input.values),payload:{targets:input.targets,values:input.values},created_at:f.clock()}).execute();
  await f.db.insertInto('fleet_operation_items').values(input.targets.map(t=>({operation_id:request,host_id:t.id,expected_revision:'1',state:t.id===f.hostId?'completed' as const:'pending' as const,outcome:t.id===f.hostId?'applied':null,revision:null,completed_at:t.id===f.hostId?f.clock():null}))).execute();
  await remove();await finish();
  const saved=await f.db.selectFrom('fleet_operations').select('payload').where('id','=',request).executeTakeFirstOrThrow();expect(JSON.stringify(saved.payload)).not.toContain(f.hostId);
  const resumed=await resumeOperation(f.db,f.session,request,f.clock);expect(resumed.items.find(i=>i.host_id===other.hostId)).toMatchObject({state:'completed',outcome:'applied'});
  expect(await f.db.selectFrom('fleet_host_tags').selectAll().where('host_id','=',other.hostId).execute()).toEqual([{host_id:other.hostId,tag:'production'}]);
  const exact=await fleetOperation(f.db,f.session,{request_id:request,kind:input.kind,targets:input.targets,values:input.values},f.clock);expect(exact.items).toEqual(resumed.items);
 });

 async function pastAudit(){
  for(let n=0;n<20;n++){
   await purgeNextBatch(f.db,f.clock);
   const job=await f.db.selectFrom('fleet_purge_jobs').selectAll().where('host_id','=',f.hostId).executeTakeFirstOrThrow();
   expect(job.state).not.toBe('failed');if(job.stage>4)return;
  }throw new Error('audit_stage_not_reached');
 }
 it('ignores interrupted claims from deleting hosts while delivering unrelated notifications',async()=>{
  await f.diskState(1);await f.enqueue();const held=await claimEvent(f.db,(await f.events())[0]!,f.settings,f.clock);expect(held).not.toBeNull();
  const audit=await f.db.selectFrom('audit_events').selectAll().where('notification_event','=',held!.event.id).executeTakeFirstOrThrow();
  const other=await lifecycleFixture();
  try {
   await f.advance(other.clock());await other.advance(f.clock());
   const run=other.disk(1);run.mounts[0]!.available_bytes='10';run.mounts[0]!.free_bytes='10';await other.diskPost(run);
   await sampleFamily(f.db,f.routeId,f.settings,other.hostId,'disk-local',f.clock);
   await remove();await pastAudit();
   await expect(recoverClaims(f.db,f.clock)).resolves.toBeUndefined();
   expect(await f.db.selectFrom('audit_events').select('id').where('notification_event','=',held!.event.id).execute()).toHaveLength(0);
   // The database fence also catches a forgotten event-only/attempt-only writer.
   await expect(f.db.transaction().execute(trx=>notificationAudit(trx,f.routeId,f.clock(),'closed','late_worker',held!.event.id))).rejects.toMatchObject({code:'P0001'});
   await expect(f.db.insertInto('audit_events').values({...audit,id:randomUUID(),notification_event:null,notification_attempt:held!.event.attempt_id}).execute()).rejects.toMatchObject({code:'P0001'});
   await f.tick();expect(f.captured).toHaveLength(1);
   expect((await f.events()).find(e=>e.cursor_id!==held!.event.cursor_id)?.state).toBe('captured');
   await finish();expect(await f.db.selectFrom('hosts').select('id').where('id','=',other.hostId).execute()).toHaveLength(1);
  }finally{await other.db.destroy();}
 });
 it('allows deletion while pending expiry is waiting to acquire its host',async()=>{
  await f.diskState(1);await f.enqueue();const event=(await f.events())[0]!;
  await f.db.updateTable('notification_outbox').set({created_at:new Date(+f.clock()-86400001)}).where('id','=',event.id).execute();
  let ready!:()=>void,release!:()=>void,calls=0;
  const entered=new Promise<void>(r=>{ready=r;}),waiting=new Promise<void>(r=>{release=r;}),real=control.fleetHostLock;
  const spy=vi.spyOn(control,'fleetHostLock').mockImplementation(async(...args)=>{if(++calls===1){ready();await waiting;}return real(...args);});
  const ticking=runNotifications(f.db,"tinywarden_test_p1b",f.settings,f.transport,f.clock);await entered;
  try{await remove();await pastAudit();}finally{release();}
  await expect(ticking).resolves.toMatchObject({outcome:'completed',attempts:0});spy.mockRestore();
  expect(await f.db.selectFrom('audit_events').select('id').where('notification_event','=',event.id).execute()).toHaveLength(0);
  await finish();
 });
 it('rejects a late uncertainty acknowledgement and recovers older failed purge jobs',async()=>{
  await f.diskState(1);await f.enqueue();const held=await claimEvent(f.db,(await f.events())[0]!,f.settings,f.clock);expect(held).not.toBeNull();
  await recoverClaims(f.db,f.clock);
  const audit=await f.db.selectFrom('audit_events').select('id').where('notification_event','=',held!.event.id).execute();expect(audit.length).toBeGreaterThan(0);
  await remove();
  // Durable shape left by an older failed worker: dependencies still exist but
  // the cursor is already downstream of audit removal. Retry must revisit them.
  await f.db.updateTable('fleet_purge_jobs').set({state:'failed',stage:30,error:'purge_failed'}).where('host_id','=',f.hostId).execute();
  await expect(acknowledgeUncertainty(f.db,'tinywarden_test_p1b',held!.event.id,f.clock)).rejects.toThrow('notification_event_unavailable');
  const {retryPurge}=await import('../../server/fleet/purge');
  await retryPurge(f.db,f.session,f.hostId,f.clock);
  expect((await f.db.selectFrom('fleet_purge_jobs').select('stage').where('host_id','=',f.hostId).executeTakeFirst())?.stage).toBe(0);
  await finish();expect(await f.db.selectFrom('notification_outbox').select('id').execute()).toHaveLength(0);
 });
 async function interruptedRemoval(kind:'delete'|'archive'){
  const other=await lifecycleFixture();await other.db.destroy();
  const targets=[{id:f.hostId,revision:'1'},{id:other.hostId,revision:'1'}].sort((a,b)=>a.id.localeCompare(b.id));
  const preview=await removalPreview(f.db,f.session,kind,targets,f.clock),input={request_id:randomUUID(),kind,targets,values:{preview:preview.preview}};
  const real=control.fleetHostLock;let calls=0;
  const spy=vi.spyOn(control,'fleetHostLock').mockImplementation(async(...args)=>{if(++calls===2)throw new Error('connection_interrupted');return real(...args);});
  try{await expect(fleetOperation(f.db,f.session,input,f.clock)).rejects.toThrow('connection_interrupted');}finally{spy.mockRestore();}
  const first=targets[0]!,pending=targets[1]!;
  if(kind==='archive'){
   const deletionTargets=[{id:first.id,revision:'2'}],p=await removalPreview(f.db,f.session,'delete',deletionTargets,f.clock);
   await fleetOperation(f.db,f.session,{request_id:randomUUID(),kind:'delete',targets:deletionTargets,values:{preview:p.preview}},f.clock);
  }
  await finish(first.id);
  const saved=await f.db.selectFrom('fleet_operations').selectAll().where('id','=',input.request_id).executeTakeFirstOrThrow();
  expect(saved.payload.targets).toEqual([pending]);expect(saved.removal_policy_revision).toBe('1');
  expect(JSON.stringify(saved.payload)).not.toContain(first.id);
  return {input,pending,first};
 }
 it.each(['delete','archive'] as const)('resumes confirmed %s after minimizing a deleted target, including another Admin and exact retry',async kind=>{
  const {input,pending}=await interruptedRemoval(kind);
  const credential=newCredential('session'),operator=randomUUID();
  await f.db.insertInto('operators').values({id:operator,login:'second-admin',role:'admin',recovery_admin:false,disabled_at:null,auth_version:1,created_at:f.clock()}).execute();
  await f.db.insertInto('operator_sessions').values({id:credential.id,operator_id:operator,secret_digest:credential.digest,auth_version:1,issued_at:f.clock(),last_seen_at:f.clock(),expires_at:new Date(+f.clock()+3600000)}).execute();
  const resumed=await resumeOperation(f.db,credential.value,input.request_id,f.clock);
  expect(resumed.items.find(i=>i.host_id===pending.id)).toMatchObject({state:'completed',outcome:kind==='delete'?'purge_pending':'applied'});
  expect((await fleetOperation(f.db,f.session,input,f.clock)).items).toEqual(resumed.items);
  await expect(fleetOperation(f.db,f.session,{...input,values:{preview:'0'.repeat(64)}},f.clock)).rejects.toMatchObject({code:'idempotency_conflict'});
  await expect(fleetOperation(f.db,credential.value,input,f.clock)).rejects.toMatchObject({code:'idempotency_conflict'});
 });
 it.each(['policy','revision','authority','confirmation'] as const)('still checks current %s when resuming a minimized removal',async boundary=>{
  const {input,pending}=await interruptedRemoval('delete');
  if(boundary==='policy'){
   const p=await readRetentionSettings(f.db,f.session,f.clock);
   await saveRetentionSettings(f.db,f.session,{request_id:randomUUID(),expected_revision:p.revision,days:365,confirmation:null},f.clock);
  }else if(boundary==='revision'){
   await fleetOperation(f.db,f.session,{request_id:randomUUID(),kind:'membership',targets:[pending],values:{add_groups:[],remove_groups:[],add_tags:['changed'],remove_tags:[]}},f.clock);
  }else if(boundary==='confirmation'){
   await f.db.updateTable('fleet_operations').set({removal_policy_revision:null}).where('id','=',input.request_id).execute();
  }else{
   const actor=await f.db.selectFrom('fleet_operations').select('operator_id').where('id','=',input.request_id).executeTakeFirstOrThrow();
   await f.db.updateTable('operators').set({disabled_at:f.clock()}).where('id','=',actor.operator_id).execute();
   await expect(resumeOperation(f.db,f.session,input.request_id,f.clock)).rejects.toMatchObject({code:'unauthorized'});
   expect((await f.db.selectFrom('fleet_operation_items').select('state').where('operation_id','=',input.request_id).where('host_id','=',pending.id).executeTakeFirst())?.state).toBe('pending');return;
  }
  const resumed=await resumeOperation(f.db,f.session,input.request_id,f.clock);
  expect(resumed.items.find(i=>i.host_id===pending.id)).toMatchObject({state:boundary==='revision'?'conflict':'failed',outcome:boundary==='revision'?'settings_conflict':'preview_changed'});
  expect((await f.db.selectFrom('hosts').select('lifecycle').where('id','=',pending.id).executeTakeFirst())?.lifecycle).toBe('active');
 });

});
