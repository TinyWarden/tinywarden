import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {fleetActionReason,maintenancePhase,partitionFleetAction,type FleetActionSubject} from '../../lib/fleet-actions';
import {fleetMenuActions} from '../../app/fleet/_components/actions';
import type {ServerRow} from '../../app/fleet/_components/model';
import {lifecycleFixture,resetTestSchema,url} from '../p4a.fixture';
import {fleetOperation} from '../../server/fleet/commands';

const subject=(extra:Partial<FleetActionSubject>={}):FleetActionSubject=>({lifecycle:'active',control_supported:true,maintenance:null,update:{available:false,version:null,reason:'update_already_current'} as FleetActionSubject['update'],...extra});
const row=(id:string,extra:Partial<FleetActionSubject>={})=>({...subject(extra),host_id:id,label:id} as ServerRow);
describe('Contextual Fleet actions',()=>{
 it('offers only the applicable member of each opposing action pair',()=>{
  const actions=(r:ServerRow)=>fleetMenuActions([r]).map(x=>x.action);
  expect(actions(row('active'))).toEqual(['metadata','membership','maintenance','pause','reconnect','remove']);
  expect(actions(row('paused',{lifecycle:'paused'}))).toEqual(['metadata','membership','resume','reconnect','remove']);
  expect(actions(row('archived',{lifecycle:'archived'}))).toEqual(['metadata','membership','restore','remove']);
  expect(actions(row('legacy',{control_supported:false}))).not.toContain('pause');
  expect(actions(row('deleting',{lifecycle:'deleting'}))).toEqual([]);
 });
 it('uses distinct maintenance choices and never schedules over an existing window',()=>{
  for(const phase of ['scheduled','active'] as const){
   const actions=fleetMenuActions([row('window',{maintenance:{phase}})]).map(x=>x.action);
   expect(actions).toContain('editMaintenance');expect(actions).not.toContain('maintenance');
   expect(actions.includes('cancelMaintenance')).toBe(phase==='scheduled');
   expect(actions.includes('endMaintenance')).toBe(phase==='active');
  }
 });
 it('counts the exact eligible subset in a mixed selection without changing that selection',()=>{
  const rows=[row('active'),row('paused',{lifecycle:'paused'}),row('legacy',{control_supported:false}),row('update',{update:{available:true,reason:null}})];
  const before=structuredClone(rows),menu=fleetMenuActions(rows);
  expect(menu.find(x=>x.action==='pause')?.label).toBe('Pause monitoring · 2');
  expect(menu.find(x=>x.action==='resume')?.label).toBe('Resume monitoring · 1');
  expect(menu.find(x=>x.action==='update')?.label).toBe('Update now · 1');
  const split=partitionFleetAction('pause',rows);
  expect(split.eligible.map(x=>x.host_id)).toEqual(['active','update']);
  expect(split.skipped.map(x=>x.subject.host_id)).toEqual(['paused','legacy']);
  expect(menu.some(x=>['metadata','reconnect','restore'].includes(x.action))).toBe(false);
  expect(rows).toEqual(before);
 });
 it('hides duplicate update and reconnect while retaining safe independent actions',()=>{
  const current=row('updating',{update:{available:false,reason:'update_in_progress',in_progress:true}}),actions=fleetMenuActions([current]).map(x=>x.action);
  expect(actions).not.toContain('update');expect(actions).not.toContain('reconnect');
  for(const action of ['metadata','membership','pause','remove'])expect(actions).toContain(action);
  // Local automatic updates also block reconnect even if no remote capability exists.
  expect(fleetActionReason('reconnect',subject({update:{available:false,reason:'update_agent_upgrade_required',in_progress:true}}))).toBe('update_in_progress');
 });
 it('classifies exact time boundaries identically for reads and commands',()=>{
  const starts_at='2026-10-23T12:00:00Z',ends_at='2026-10-23T13:00:00Z';
  expect(maintenancePhase({starts_at,ends_at},new Date('2026-10-23T11:59:59Z'))).toEqual({phase:'scheduled'});
  expect(maintenancePhase({starts_at,ends_at},new Date(starts_at))).toEqual({phase:'active'});
  expect(maintenancePhase({starts_at,ends_at},new Date(ends_at))).toBeNull();
  expect(maintenancePhase({starts_at,ends_at:null},new Date(ends_at))).toEqual({phase:'active'});
 });
 it('offers removal for all selected servers but archives only the eligible subset',()=>{
  const rows=[row('live'),row('archive',{lifecycle:'archived'})];
  expect(fleetMenuActions(rows).find(x=>x.action==='remove')?.label).toBe('Remove servers');
  expect(partitionFleetAction('archive',rows).eligible.map(x=>x.host_id)).toEqual(['live']);
  expect(partitionFleetAction('delete',rows).eligible).toHaveLength(2);
 });
});

describe.skipIf(!url)('Authoritative Fleet action eligibility',()=>{
 let f:Awaited<ReturnType<typeof lifecycleFixture>>;
 beforeEach(async()=>{await resetTestSchema();f=await lifecycleFixture();});
 afterEach(async()=>{await f?.db.destroy();});
 const operation=(revision:string,action:string,starts_at:string|null=null,ends_at:string|null=null,request_id=randomUUID())=>({request_id,kind:'maintenance',targets:[{id:f.hostId,revision}],values:{action,starts_at,ends_at}});
 it('rechecks a scheduled-to-active transition without relying on a changed revision',async()=>{
  const start=new Date(+f.clock()+60000),end=new Date(+start+60000);
  const create=operation('1','schedule',start.toISOString(),end.toISOString());
  expect((await fleetOperation(f.db,f.session,create,f.clock)).items[0]?.state).toBe('completed');
  expect((await fleetOperation(f.db,f.session,operation('2','schedule'),f.clock)).items[0]).toMatchObject({state:'failed',outcome:'maintenance_changed'});
  await f.advance(start);
  expect((await fleetOperation(f.db,f.session,operation('2','cancel'),f.clock)).items[0]).toMatchObject({state:'failed',outcome:'maintenance_changed'});
  expect((await f.db.selectFrom('fleet_maintenance').select('closed_at').executeTakeFirst())?.closed_at).toBeNull();
  const stop=operation('2','end');expect((await fleetOperation(f.db,f.session,stop,f.clock)).items[0]?.state).toBe('completed');
  expect((await fleetOperation(f.db,f.session,stop,f.clock)).items[0]?.state).toBe('completed');
  expect((await f.db.selectFrom('hosts').select('fleet_revision').executeTakeFirst())?.fleet_revision).toBe('3');
 });
 it('edits and cancels a scheduled window without granting end or silently replacing it',async()=>{
  const start=new Date(+f.clock()+3600000).toISOString();
  await fleetOperation(f.db,f.session,operation('1','schedule',start),f.clock);
  expect((await fleetOperation(f.db,f.session,operation('2','end'),f.clock)).items[0]?.outcome).toBe('maintenance_changed');
  expect((await fleetOperation(f.db,f.session,operation('2','edit',start,new Date(+f.clock()+7200000).toISOString()),f.clock)).items[0]?.state).toBe('completed');
  expect((await fleetOperation(f.db,f.session,operation('3','cancel'),f.clock)).items[0]?.state).toBe('completed');
  expect((await fleetOperation(f.db,f.session,operation('4','edit',start),f.clock)).items[0]?.outcome).toBe('maintenance_changed');
 });
});
