import {setTimeout as delay} from 'node:timers/promises';
import {afterEach,beforeEach,describe,it,expect} from 'vitest';
import {lifecycleFixture,resetTestSchema,url} from '../p4a.fixture';
import {actionFixture,readyActionFixture,type AwaitedLifecycle} from './skill-actions.fixture';
import {createMaintenanceOperation} from '../../server/maintenance/operations';
import {waitForAgentWork} from '../../server/maintenance/work-wait';

describe.skipIf(!url)('bounded authenticated agent work waiting',()=>{
 let f:AwaitedLifecycle;
 beforeEach(async()=>{await resetTestSchema();f=await lifecycleFixture();});
 afterEach(async()=>{await f?.db.destroy();});
 const request=(seconds:number,signal=new AbortController().signal)=>waitForAgentWork(f.db,f.agentCredential,{schema_version:1,wait_seconds:seconds,cursor:null},f.clock,signal);
 it('wakes for exact queued work without locking the host, delivering a grant or renewing contact',async()=>{
  const source=await actionFixture(f),{input}=await readyActionFixture(f,source);
  const before=await f.db.selectFrom('agent_credentials').select(['last_contact_at','accepted_at']).where('agent_id','=',f.agentId).execute();
  const started=performance.now(),waiting=request(3);await delay(50);
  const op=await createMaintenanceOperation(f.db,f.session,input,f.clock);
  expect(await waiting).toMatchObject({schema_version:1,available:true,cursor:expect.stringMatching(/^[a-f0-9]{64}$/)});expect(performance.now()-started).toBeLessThan(2500);
  expect(await f.db.selectFrom('maintenance_jobs').select(['phase','apply_attempt']).where('operation_id','=',op.id).executeTakeFirst()).toEqual({phase:'queued',apply_attempt:null});
  expect(await f.db.selectFrom('agent_credentials').select(['last_contact_at','accepted_at']).where('agent_id','=',f.agentId).execute()).toEqual(before);
  await f.db.updateTable('maintenance_jobs').set({generation:'2'}).where('operation_id','=',op.id).execute();
  expect((await request(0)).available).toBe(false);
 });
 it('waits on an unchanged job and wakes when its approval state changes',async()=>{
  const source=await actionFixture(f),{input}=await readyActionFixture(f,source);
  const op=await createMaintenanceOperation(f.db,f.session,input,f.clock);
  await f.db.updateTable('maintenance_jobs').set({phase:'awaiting_approval'}).where('operation_id','=',op.id).execute();
  const first=await request(0);
  const query={schema_version:1,wait_seconds:0,cursor:first.cursor};
  expect((await waitForAgentWork(f.db,f.agentCredential,query,f.clock,new AbortController().signal)).available).toBe(false);
  const waiting=waitForAgentWork(f.db,f.agentCredential,{...query,wait_seconds:3},f.clock,new AbortController().signal);
  await delay(50);await f.db.updateTable('maintenance_jobs').set({phase:'approved'}).where('operation_id','=',op.id).execute();
  expect(await waiting).toMatchObject({available:true,cursor:expect.not.stringContaining(first.cursor)});
 });
 it('bounds duration, rejects duplicate waits and cleans up after an abort',async()=>{
  expect((await request(0)).available).toBe(false);
  for(const n of [-1,26,1.5])await expect(request(n)).rejects.toMatchObject({code:'invalid_request'});
  const controller=new AbortController(),waiting=request(3,controller.signal);const aborted=expect(waiting).rejects.toBeTruthy();
  await delay(50);await expect(request(0)).rejects.toMatchObject({code:'temporarily_unavailable'});
  controller.abort();await aborted;expect((await request(0)).available).toBe(false);
 });
 it('rechecks revocation before returning from a wait',async()=>{
  const waiting=request(1),denied=expect(waiting).rejects.toMatchObject({code:'unauthorized'});
  await delay(50);await f.db.updateTable('agent_credentials').set({revoked_at:f.clock()}).where('agent_id','=',f.agentId).execute();
  await denied;
 });
});
