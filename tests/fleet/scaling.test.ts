import {activityOptions,setupActivity,operationActivity} from '../../server/fleet/activity';
import {readOperation,resumeOperation,fleetOperation,operationInput} from '../../server/fleet/commands';
import {commandFingerprint} from '../../server/skills/catalog/package-commands';
import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {lifecycleFixture,resetTestSchema,url} from '../p4a.fixture';
import {newCredential} from '../../server/validation';
import {readGroups,groupOptions} from '../../server/fleet/groups';
import {readFleet,fleetOptions} from '../../server/fleet/list';
import {operatorFleetGroups} from '../../server/http/fleet-handlers';

describe.skipIf(!url)('Fleet discovery at scale',()=>{
 let f:Awaited<ReturnType<typeof lifecycleFixture>>;
 beforeEach(async()=>{await resetTestSchema();f=await lifecycleFixture();});afterEach(async()=>{await f?.db.destroy();});
 it('searches and pages beyond1000 groups while scoping selected labels and counts',async()=>{
  const groups=Array.from({length:1005},(_,n)=>({id:randomUUID(),name:'Group '+String(n).padStart(4,'0'),description:'Private group notes',created_at:f.clock()}));
  await f.db.insertInto('fleet_groups').values(groups).execute();
  const first=await readGroups(f.db,f.session,groupOptions(''),f.clock);expect(first.groups).toHaveLength(50);expect(first.next_cursor).not.toBeNull();
  const next=await readGroups(f.db,f.session,groupOptions('?cursor='+first.next_cursor),f.clock);expect(next.groups[0]!.name).toBe('Group 0050');
  const last=groups.at(-1)!;const found=await readGroups(f.db,f.session,groupOptions('?q=1004'),f.clock);expect(found.groups.map(g=>g.id)).toEqual([last.id]);
  expect((await readGroups(f.db,f.session,groupOptions('?q=no-match&selected='+last.id),f.clock)).selected.map(g=>g.id)).toEqual([last.id]);
  const id=randomUUID(),session=newCredential('session');await f.db.insertInto('operators').values({id,login:'scoped-reader',role:'user',recovery_admin:false,disabled_at:null,auth_version:1,created_at:f.clock()}).execute();
  await f.db.insertInto('operator_sessions').values({id:session.id,operator_id:id,secret_digest:session.digest,auth_version:1,issued_at:f.clock(),last_seen_at:f.clock(),expires_at:new Date(+f.clock()+3600000)}).execute();
  expect((await readGroups(f.db,session.value,groupOptions('?selected='+last.id),f.clock)).selected).toEqual([]);
  await f.db.insertInto('fleet_group_hosts').values({group_id:last.id,host_id:f.hostId}).execute();await f.db.insertInto('access_user_hosts').values({operator_id:id,host_id:f.hostId}).execute();
  const visible=await readGroups(f.db,session.value,groupOptions(''),f.clock);expect(visible.groups).toEqual([expect.objectContaining({id:last.id,count:1,description:''})]);
  const response=await operatorFleetGroups(f.req('/api/v1/operator/fleet-groups?q=1004',undefined,undefined,f.session),f.ctx);expect(response.status).toBe(200);
 });
 it('paginates hundreds of matching hosts from scoped batches with stable cursors',async()=>{
  const original=await f.db.selectFrom('hosts').selectAll().where('id','=',f.hostId).executeTakeFirstOrThrow();
  await f.db.insertInto('hosts').values(Array.from({length:500},(_,n)=>({...original,id:randomUUID(),label:'Fleet '+String(n).padStart(4,'0')}))).execute();
  const started=performance.now(),one=await readFleet(f.db,f.session,fleetOptions('?q=Fleet&limit=100'),f.clock);
  const two=await readFleet(f.db,f.session,fleetOptions('?q=Fleet&limit=100&cursor='+one.next_cursor),f.clock);
  expect(one.total).toBe(500);expect(one.hosts).toHaveLength(100);expect(two.hosts[0]!.label).toBe('Fleet 0100');expect(new Set([...one.hosts,...two.hosts].map(h=>h.host_id)).size).toBe(200);
  expect(performance.now()-started).toBeLessThan(10000);
  expect(()=>fleetOptions('?q=changed&cursor='+one.next_cursor)).toThrow();
 });
 it('keeps old unfinished codes/operations discoverable and lets a current Admin recover another Admin’s pending work',async()=>{
  const at=f.clock(),actor=await f.db.selectFrom('operators').select('id').where('recovery_admin','=',true).executeTakeFirstOrThrow(),request=randomUUID();
  const raw={request_id:request,kind:'membership',targets:[{id:f.hostId,revision:'1'}],values:{add_groups:[],remove_groups:[],add_tags:['recovered'],remove_tags:[]}},input=operationInput(raw);
  await f.db.insertInto('fleet_operations').values({id:request,operator_id:actor.id,kind:input.kind,payload:{targets:input.targets,values:input.values},fingerprint:commandFingerprint('fleet_operation',input.kind,input.targets,input.values),created_at:at}).execute();
  await f.db.insertInto('fleet_operation_items').values({operation_id:request,host_id:f.hostId,expected_revision:'1',outcome:null,revision:null,completed_at:null}).execute();
  await f.db.insertInto('fleet_operations').values(Array.from({length:55},(_,n)=>({id:randomUUID(),operator_id:actor.id,kind:'metadata',payload:{},fingerprint:Buffer.alloc(32),created_at:new Date(+at+n+1)}))).execute();
  await f.db.insertInto('enrollment_tokens').values(Array.from({length:60},(_,n)=>{const c=newCredential('enrollment');return {id:c.id,secret_digest:c.digest,issued_by:actor.id,issuance_request_id:randomUUID(),issuance_fingerprint:Buffer.alloc(32),label:'Code '+n,target_agent_id:n===0?f.agentId:null,expected_generation:n===0?1:null,issued_at:new Date(+at+n),expires_at:new Date(+at+n+900000),revoked_at:n===0?null:new Date(+at+n+1),consumed_at:null,consumed_request_id:null,consumed_fingerprint:null,consumed_credential_id:null};})).execute();
  await f.advance(new Date(+at+100));
  const first=await operationActivity(f.db,f.session,activityOptions('','operations'),f.clock);expect(first.operations).toHaveLength(25);expect(first.total).toBe(56);expect(first.next_cursor).not.toBeNull();
  const pending=await operationActivity(f.db,f.session,activityOptions('?pending=1','operations'),f.clock);expect(pending.operations.map(o=>o.id)).toEqual([request]);
  const codes=await setupActivity(f.db,f.session,activityOptions('?pending=1','setups'),f.clock);expect(codes.setups).toHaveLength(1);expect(codes.setups[0]).toMatchObject({label:'Code 0',mode:'replace',state:'pending'});expect(JSON.stringify(codes)).not.toMatch(/secret_digest|tw_e_/);
  const id=randomUUID(),session=newCredential('session');await f.db.insertInto('operators').values({id,login:'recovery-colleague',role:'admin',recovery_admin:false,disabled_at:null,auth_version:1,created_at:f.clock()}).execute();
  await f.db.insertInto('operator_sessions').values({id:session.id,operator_id:id,secret_digest:session.digest,auth_version:1,issued_at:f.clock(),last_seen_at:f.clock(),expires_at:new Date(+f.clock()+3600000)}).execute();await f.db.updateTable('operators').set({disabled_at:f.clock()}).where('id','=',actor.id).execute();
  expect((await readOperation(f.db,session.value,request,f.clock)).items[0]!.state).toBe('pending');
  expect((await resumeOperation(f.db,session.value,request,f.clock)).items[0]!.state).toBe('completed');
  expect(await f.db.selectFrom('fleet_audit').select('operator_id').where('operation_id','=',request).execute()).toEqual([{operator_id:id}]);
  await expect(fleetOperation(f.db,session.value,raw,f.clock)).rejects.toMatchObject({code:'idempotency_conflict'});
 });

});
