import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {notificationFixture,url} from '../p4b.fixture';
import {fleetOperation} from '../../server/fleet/commands';
import {readDashboard} from '../../server/fleet/dashboard';

describe.skipIf(!url)('Fleet maintenance notification boundaries',()=>{
 let f:Awaited<ReturnType<typeof notificationFixture>>;
 beforeEach(async()=>{f=await notificationFixture();});afterEach(async()=>{await f?.db.destroy();});
 const schedule=(start:number,end:number)=>fleetOperation(f.db,f.session,{request_id:randomUUID(),kind:'maintenance',targets:[{id:f.hostId,revision:'1'}],values:{action:'schedule',starts_at:new Date(+f.clock()+start*1000).toISOString(),ends_at:new Date(+f.clock()+end*1000).toISOString()}},f.clock);
 it('cancels pending delivery, keeps collecting and reports one fresh persistent problem after maintenance',async()=>{
  await f.diskState(1,90);await f.enqueue();expect((await f.events()).some(e=>e.state==='pending')).toBe(true);
  expect((await schedule(0,60)).items[0]?.state).toBe('completed');
  await f.tick();expect(f.captured).toHaveLength(0);
  const dashboard=await readDashboard(f.db,f.session,{},f.clock);expect(dashboard.counts.total).toBe(0);expect(dashboard.fleet_management.maintenance).toBe(1);
  await f.advanceSeconds(10);await f.diskState(2,90);await f.tick();expect(f.captured).toHaveLength(0);
  await f.advanceSeconds(51);await f.enqueue();await f.tick();expect(f.captured).toHaveLength(0);
  await f.advanceSeconds(60);await f.diskState(3,90);await f.enqueue();await f.tick();expect(f.captured).toHaveLength(1);
  await f.tick();expect(f.captured).toHaveLength(1);
 });
 it('honors a scheduled window even when no worker tick observes it active',async()=>{
  await f.diskState(1,90);await f.enqueue();await schedule(60,120);
  await f.advanceSeconds(121);await f.tick();expect(f.captured).toHaveLength(0);
  expect((await f.events()).filter(e=>e.state==='pending')).toHaveLength(0);
  await f.advanceSeconds(60);await f.diskState(2,90);await f.enqueue();await f.tick();expect(f.captured).toHaveLength(1);
 });
});
