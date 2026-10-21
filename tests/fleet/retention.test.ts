import {randomUUID} from 'node:crypto';
import {sql} from 'kysely';
import * as trimContext from '../../server/skills/legacy/trim/context-store';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {lifecycleFixture,resetTestSchema,sample,url} from '../p4a.fixture';
import {readRetentionSettings,saveRetentionSettings} from '../../server/data/retention-settings';
import {pruneExpiredObservations} from '../../server/maintenance/retention';
import {pruneObservationBatch} from '../../server/skills/results/retention';
import {operatorRetention} from '../../server/http/retention-handlers';
import {operatorFleetGroup,operatorFleetOperation} from '../../server/http/fleet-handlers';

describe.skipIf(!url)('Configurable retained data',()=>{
 let f:Awaited<ReturnType<typeof lifecycleFixture>>;
 beforeEach(async()=>{await resetTestSchema();f=await lifecycleFixture();});afterEach(async()=>{vi.restoreAllMocks();await f?.db.destroy();});
 const save=(days:number,expected:string,confirmation:string|null=null,request=randomUUID())=>saveRetentionSettings(f.db,f.session,{request_id:request,expected_revision:expected,days,confirmation},f.clock);
 it('retains old detail beyond90 days, then hides reduced history before cleanup without resurrection',async()=>{
  const run=f.disk(1),response=await f.diskPost(run);expect(response.status).toBe(200);
  expect((await save(365,'1')).days).toBe(365);
  await f.advance(new Date(+f.clock()+100*86400000));
  expect((await f.diskHealth()).history).toHaveLength(1);
  expect((await pruneExpiredObservations(f.db,'tinywarden_test_p1b',true,f.clock)).disk_runs).toBe(0);
  await expect(save(1,'2')).rejects.toMatchObject({code:'confirmation_required'});
  const preview=await readRetentionSettings(f.db,f.session,f.clock,1);
  const command={request_id:randomUUID(),expected_revision:'2',days:1,confirmation:preview.preview!.confirmation};
  const reduced=await saveRetentionSettings(f.db,f.session,command,f.clock);expect(reduced).toMatchObject({days:1,revision:'3'});
  expect((await f.diskHealth()).history).toHaveLength(0);
  expect(await f.db.selectFrom('disk_runs').select('id').execute()).toHaveLength(1);
  await save(365,'3');expect((await f.diskHealth()).history).toHaveLength(0);
  expect((await pruneExpiredObservations(f.db,'tinywarden_test_p1b',true,f.clock)).disk_runs).toBe(1);
  expect((await f.diskPost(run)).status).toBe(200);
  expect(await f.db.selectFrom('disk_runs').select('id').execute()).toHaveLength(0);
  expect((await saveRetentionSettings(f.db,f.session,command,f.clock)).revision).toBe('3');
 });
 it('rejects an obsolete cleanup pass before deleting and validates policy bounds',async()=>{
  const run=f.disk(1);await f.diskPost(run);await save(365,'1');
  await expect(pruneObservationBatch(f.db,'disk',new Date(+f.clock()+1),f.clock(),'1',90)).rejects.toThrow('retention_policy_changed');
  expect(await f.db.selectFrom('disk_runs').select('id').execute()).toHaveLength(1);
  await expect(save(0,'2')).rejects.toMatchObject({code:'invalid_request'});await expect(save(3651,'2')).rejects.toMatchObject({code:'invalid_request'});
 });
 it('accepts HTTP envelopes for Fleet commands and policy without persisting schema wrappers',async()=>{
  const group=await operatorFleetGroup(f.req('/api/v1/operator/fleet-groups',{schema_version:1,request_id:randomUUID(),action:'create',id:null,expected_revision:null,name:'Production',description:''},undefined,f.session),undefined,f.ctx);
  expect(group.status).toBe(200);
  const command=await operatorFleetOperation(f.req('/api/v1/operator/fleet-operations',{schema_version:1,request_id:randomUUID(),kind:'membership',targets:[{id:f.hostId,revision:'1'}],values:{add_groups:[],remove_groups:[],add_tags:['eu'],remove_tags:[]}},undefined,f.session),f.ctx);
  expect(command.status).toBe(200);expect((await command.json() as {items:{state:string}[]}).items[0]!.state).toBe('completed');
  const policy=await operatorRetention(f.req('/api/v1/operator/data-retention',{schema_version:1,request_id:randomUUID(),expected_revision:'1',days:365,confirmation:null},undefined,f.session),f.ctx);
  expect(policy.status).toBe(200);expect(await policy.json()).toMatchObject({days:365,revision:'2'});
 });
 it('serializes legacy context commits with retention changes and drops expired nested execution on the next run',async()=>{
  const delivery=f.baselines.find(a=>a.definition_key==='fstrim-status')!;
  const original=sample('fstrim-status',delivery,f.clock(),1);expect((await f.run(original)).status).toBe(200);
  await f.advance(new Date(+f.clock()+10*86400000));
  let ready!:()=>void,release!:()=>void;
  const captured=new Promise<void>(resolve=>{ready=resolve;}),waiting=new Promise<void>(resolve=>{release=resolve;});
  const real=trimContext.captureFstrimContext;
  const spy=vi.spyOn(trimContext,'captureFstrimContext').mockImplementation(async(...args)=>{const result=await real(...args);ready();await waiting;return result;});
  const late=sample('fstrim-status',delivery,f.clock(),2,true),accepting=f.run(late);
  await captured;
  const preview=await readRetentionSettings(f.db,f.session,f.clock,1);
  const saving=saveRetentionSettings(f.db,f.session,{request_id:randomUUID(),expected_revision:'1',days:1,confirmation:preview.preview!.confirmation},f.clock);
  try {
   // Observe an actual PostgreSQL lock wait rather than assuming a sleep proves it.
   await vi.waitFor(async()=>{
    const rows=(await sql<{waiting:string}>`SELECT count(*)::text AS waiting FROM pg_stat_activity
      WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock'
      AND query LIKE '%data_retention_policy%'`.execute(f.db)).rows;
    expect(Number(rows[0]!.waiting)).toBeGreaterThan(0);
   },{timeout:2000,interval:20});
  }finally{release();}
  expect((await accepting).status).toBe(200);const reduced=await saving;spy.mockRestore();
  // The first commit preceded the edit. Its execution cannot be carried into a
  // fresh result after the new cutoff, even through a recent intermediate row.
  const prior=await f.db.selectFrom('baseline_runs').select('fstrim_context').where('id','=',late.run_id).executeTakeFirstOrThrow();
  expect((prior.fstrim_context as {last_execution:{run_id:string}}).last_execution.run_id).toBe(original.run_id);
  const next=sample('fstrim-status',delivery,f.clock(),3,true);expect((await f.run(next)).status).toBe(200);
  const current=await f.db.selectFrom('baseline_runs').select('fstrim_context').where('id','=',next.run_id).executeTakeFirstOrThrow();
  expect(current.fstrim_context).toMatchObject({last_execution:null});
  expect(Date.parse(reduced.cutoff)).toBeGreaterThan(+new Date(original.finished_at));
 });

});
