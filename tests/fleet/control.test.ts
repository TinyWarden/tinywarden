import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { lifecycleFixture,resetTestSchema,sample,url,wire } from '../p4a.fixture';
import { controlPoll,controlInput } from '../../server/fleet/control';
import { acceptDiskRun } from '../../server/skills/results/disk-runs';
import { diskRunInput } from '../../server/skills/results/disk-runs';

describe.skipIf(!url)('Generic Fleet monitoring control',()=>{
 let f:Awaited<ReturnType<typeof lifecycleFixture>>;
 beforeEach(async()=>{await resetTestSchema();f=await lifecycleFixture();});afterEach(async()=>{await f?.db.destroy();});
 it('negotiates generation-scoped control and rejects future or contradictory acknowledgements',async()=>{
  const active=await controlPoll(f.db,f.agentCredential,{applied:null},f.clock);
  expect(active).toMatchObject({mode:'active',epoch:'1',generation:'1',poll_interval_seconds:60});
  expect(Date.parse(active.valid_until)-Date.parse(active.issued_at)).toBe(300000);
  await expect(controlPoll(f.db,f.agentCredential,{applied:{epoch:'2',mode:'paused'}},f.clock)).rejects.toMatchObject({code:'control_conflict'});
  await f.db.updateTable('hosts').set({lifecycle:'paused',monitoring_epoch:'2',monitoring_changed_at:f.clock()}).where('id','=',f.hostId).execute();
  expect(await controlPoll(f.db,f.agentCredential,{applied:{epoch:'1',mode:'active'}},f.clock)).toMatchObject({mode:'paused',epoch:'2'});
  await expect(controlPoll(f.db,f.agentCredential,{applied:{epoch:'2',mode:'active'}},f.clock)).rejects.toMatchObject({code:'control_conflict'});
  await controlPoll(f.db,f.agentCredential,{applied:{epoch:'2',mode:'paused'}},f.clock);
  expect(await f.db.selectFrom('fleet_agent_control').selectAll().executeTakeFirst()).toMatchObject({applied_epoch:'2',generation:'1'});
 });
 it('drains old legacy results into exact receipts without storing evidence across pause/resume',async()=>{
  const disk=f.disk(1);const accepted=await acceptDiskRun(f.db,f.agentCredential,diskRunInput(disk),f.clock);
  const lateDisk=f.disk(2),lateBaseline=sample('package-updates',f.baselines[0]!,f.clock(),2);
  await f.db.updateTable('hosts').set({lifecycle:'paused',monitoring_epoch:'2',monitoring_changed_at:f.clock()}).where('id','=',f.hostId).execute();
  const ignored=await acceptDiskRun(f.db,f.agentCredential,diskRunInput(lateDisk),f.clock);
  expect(ignored.run_id).toBe(lateDisk.run_id);
  expect((await acceptDiskRun(f.db,f.agentCredential,diskRunInput(disk),f.clock)).received_at).toBe(accepted.received_at);
  expect((await f.run(lateBaseline)).status).toBe(200);
  expect(await f.db.selectFrom('disk_runs').select('id').execute()).toHaveLength(1);
  expect(await f.db.selectFrom('baseline_runs').select('id').execute()).toHaveLength(0);
  expect(await f.db.selectFrom('disk_run_receipts').select('id').execute()).toHaveLength(1);
  await f.db.updateTable('hosts').set({lifecycle:'active',monitoring_epoch:'3'}).where('id','=',f.hostId).execute();
  expect((await acceptDiskRun(f.db,f.agentCredential,diskRunInput(lateDisk),f.clock)).received_at).toBe(ignored.received_at);
  const changed={...lateDisk,reason:'collector_failed',coverage:'incomplete',mounts:[]};
  await expect(acceptDiskRun(f.db,f.agentCredential,diskRunInput(changed),f.clock)).rejects.toMatchObject({code:'run_conflict'});
  expect((await wire(await f.health())).checks[0]!.latest).toBeNull();
 });
 it('refuses archived authority even if an old credential revocation was delayed',async()=>{
  await f.db.updateTable('hosts').set({lifecycle:'archived'}).where('id','=',f.hostId).execute();
  await expect(controlPoll(f.db,f.agentCredential,{applied:null},f.clock)).rejects.toMatchObject({code:'unauthorized'});
 });
 it('validates the isolated capability envelope',()=>{
  expect(controlInput({capabilities:['monitoring_control.v1'],applied:null})).toEqual({applied:null});
  expect(()=>controlInput({capabilities:[],applied:null})).toThrow();
  expect(()=>controlInput({capabilities:['monitoring_control.v1'],applied:{epoch:'01',mode:'active'}})).toThrow();
 });
});
