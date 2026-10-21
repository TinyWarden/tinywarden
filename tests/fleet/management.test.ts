import { randomUUID } from 'node:crypto';
import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { lifecycleFixture,resetTestSchema,url } from '../p4a.fixture';
import { newCredential } from '../../server/validation';
import { groupCommand } from '../../server/fleet/management';
import { fleetOperation,removalPreview } from '../../server/fleet/commands';
import { fleetOptions,readFleet } from '../../server/fleet/list';
import { createFleetSetup,listFleetSetups } from '../../server/fleet/setup';
import { controlPoll } from '../../server/fleet/control';
import { enroll } from '../../server/fleet/enrollment';
import { agentReconnectIntent,operatorSetup } from '../../server/http/agent-update-handlers';

describe.skipIf(!url)('Fleet organization and lifecycle',()=>{
 let f:Awaited<ReturnType<typeof lifecycleFixture>>;
 beforeEach(async()=>{await resetTestSchema();f=await lifecycleFixture();});afterEach(async()=>{await f?.db.destroy();});
 const operation=(kind:string,rev:string,values:Record<string,unknown>={},request=randomUUID())=>({request_id:request,kind,targets:[{id:f.hostId,revision:rev}],values});
 const command=(kind:string,rev:string,values:Record<string,unknown>={})=>fleetOperation(f.db,f.session,operation(kind,rev,values),f.clock);
 const group=async(name='Production')=>groupCommand(f.db,f.session,{request_id:randomUUID(),action:'create',id:null,expected_revision:null,name,description:'Private shared group description'},f.clock);
 const metadata=(groups:string[]=[],labels:string[]=[])=>({label:'Web 01',description:'Web server',owner_notes:'Private owner note',groups,tags:labels});
 async function reader(){
  const id=randomUUID(),s=newCredential('session');
  await f.db.insertInto('operators').values({id,login:'reader',role:'user',recovery_admin:false,disabled_at:null,auth_version:1,created_at:f.clock()}).execute();
  await f.db.insertInto('operator_sessions').values({id:s.id,operator_id:id,secret_digest:s.digest,auth_version:1,issued_at:f.clock(),last_seen_at:f.clock(),expires_at:new Date(+f.clock()+3600000)}).execute();
  return {id,session:s.value};
 }
 it('stores groups/tags independently of grants and scopes every list/count/choice',async()=>{
  const a=await group(),b=await group('Hidden group');
  expect((await command('metadata','1',metadata([a.id as string],['Production','EU']))).items[0]?.state).toBe('completed');
  const source=await f.db.selectFrom('hosts').selectAll().where('id','=',f.hostId).executeTakeFirstOrThrow();
  const hidden=randomUUID();await f.db.insertInto('hosts').values({...source,id:hidden,label:'Hidden host'}).execute();
  await f.db.insertInto('fleet_group_hosts').values({group_id:b.id as string,host_id:hidden}).execute();
  const u=await reader();expect((await readFleet(f.db,u.session,fleetOptions(''),f.clock)).group_totals.all).toBe(0);
  await f.db.insertInto('access_user_hosts').values({operator_id:u.id,host_id:f.hostId}).execute();
  const view=await readFleet(f.db,u.session,fleetOptions('?tag=eu&group='+a.id),f.clock);
  expect(view.total).toBe(1);expect(view.hosts[0]).toMatchObject({label:'Web 01',tags:['eu','production'],groups:[a.id]});
  expect(view.hosts[0]!.owner_notes).toBeUndefined();expect(view.groups).toHaveLength(1);expect(view.groups[0]).toMatchObject({id:a.id,description:'',count:1});
  expect(view.group_totals.all).toBe(1);expect(view.tag_choices).toEqual(['eu','production']);
  await expect(fleetOperation(f.db,u.session,operation('metadata','2',metadata()),f.clock)).rejects.toMatchObject({code:'forbidden'});
  expect(await f.db.selectFrom('access_group_hosts').selectAll().execute()).toHaveLength(0);
 });
 it('makes pause/resume commands replayable and detects changed intent or stale revisions',async()=>{
  const unsupported=await command('pause','1');expect(unsupported.items[0]).toMatchObject({state:'failed',outcome:'agent_upgrade_required'});
  await controlPoll(f.db,f.agentCredential,{applied:null},f.clock);
  const request=operation('pause','1'),paused=await fleetOperation(f.db,f.session,request,f.clock);
  expect(paused.items[0]).toMatchObject({state:'completed',revision:'2'});
  expect((await fleetOperation(f.db,f.session,request,f.clock)).items).toEqual(paused.items);
  await expect(fleetOperation(f.db,f.session,{...request,kind:'resume'},f.clock)).rejects.toMatchObject({code:'idempotency_conflict'});
  await expect(command('resume','1')).rejects.toMatchObject({code:'settings_conflict'});
  expect((await command('resume','2')).items[0]).toMatchObject({state:'completed',revision:'3'});
  expect(await f.db.selectFrom('hosts').select(['lifecycle','monitoring_epoch']).where('id','=',f.hostId).executeTakeFirst()).toEqual({lifecycle:'active',monitoring_epoch:'3'});
 });
 it('requires explicit restore, rotates credentials and resumes the original history bucket',async()=>{
  await f.diskPost(f.disk(1));const u=await reader();await f.db.insertInto('access_user_hosts').values({operator_id:u.id,host_id:f.hostId}).execute();
  const preview=await removalPreview(f.db,f.session,'archive',[{id:f.hostId,revision:'1'}],f.clock);
  expect((await command('archive','1',{preview:preview.preview})).items[0]!.state).toBe('completed');
  expect((await readFleet(f.db,u.session,fleetOptions('?lifecycle=all'),f.clock)).total).toBe(0);
  await expect(controlPoll(f.db,f.agentCredential,{applied:null},f.clock)).rejects.toMatchObject({code:'unauthorized'});
  const ticket=await createFleetSetup(f.db,f.session,{request_id:randomUUID(),mode:'restore',label:'ignored label',target_host_id:f.hostId,expected_revision:'2',groups:[],tags:[]},f.ctx.config.origin,f.clock);
  expect((await f.db.selectFrom('hosts').select('lifecycle').where('id','=',f.hostId).executeTakeFirst())!.lifecycle).toBe('archived');
  const setup=JSON.parse(Buffer.from(ticket.setup_code.split('.')[1]!,'base64url').toString()) as {token:string};
  const intent=()=>agentReconnectIntent(f.req('/api/v1/agent/reconnect-intent',{schema_version:1},setup.token),f.ctx);
  const checked=await intent();expect(checked.status).toBe(200);
  expect(await checked.json()).toMatchObject({host_id:f.hostId,agent_id:f.agentId,generation:'1',purpose:'restore'});
  await f.db.updateTable('enrollment_tokens').set({expected_generation:'2'}).where('target_agent_id','=',f.agentId).execute();
  expect((await intent()).status).toBe(409);
  expect((await f.db.selectFrom('enrollment_tokens').select('consumed_at').where('target_agent_id','=',f.agentId).executeTakeFirstOrThrow()).consumed_at).toBeNull();
  await f.db.updateTable('enrollment_tokens').set({expected_generation:'1'}).where('target_agent_id','=',f.agentId).execute();
  const credential=newCredential('agent'),input={requestId:randomUUID(),credential:credential.value,hostname:'reinstalled.example',osId:'debian',osVersion:'13',architecture:'amd64',agentVersion:'0.0.12'};
  const restored=await enroll(f.db,setup.token,input,f.ctx.config,f.clock);
  expect(restored).toMatchObject({host_id:f.hostId,agent_id:f.agentId,generation:2});
  expect((await enroll(f.db,setup.token,input,f.ctx.config,f.clock)).duplicate).toBe(true);
  expect(await f.db.selectFrom('disk_runs').select('host_id').execute()).toEqual([{host_id:f.hostId}]);
  expect((await readFleet(f.db,u.session,fleetOptions(''),f.clock)).total).toBe(1);
  expect((await f.db.selectFrom('hosts').select('reported_hostname').where('id','=',f.hostId).executeTakeFirst())!.reported_hostname).toBe('reinstalled.example');
 });
 it('binds destructive previews to the current retention policy and target revisions',async()=>{
  const p=await removalPreview(f.db,f.session,'delete',[{id:f.hostId,revision:'1'}],f.clock);
  await f.db.updateTable('data_retention_policy').set({revision:'2'}).execute();
  await expect(command('delete','1',{preview:p.preview})).rejects.toMatchObject({code:'preview_changed'});
  expect((await f.db.selectFrom('hosts').select('lifecycle').where('id','=',f.hostId).executeTakeFirst())!.lifecycle).toBe('active');
 });
 it('issues versioned setup intent and never returns setup secrets from the pending list',async()=>{
  const g=await group();const response=await operatorSetup(f.req('/api/v1/operator/servers/setup',{schema_version:2,request_id:randomUUID(),mode:'new',label:'New server',target_host_id:null,expected_revision:null,groups:[g.id],tags:['EU']},undefined,f.session),f.ctx);
  expect(response.status).toBe(201);const value=await response.json() as {setup_code:string};expect(value.setup_code).toMatch(/^tw_setup_v1\./);
  const pending=await listFleetSetups(f.db,f.session,f.clock);expect(pending.setups[0]).toMatchObject({label:'New server',mode:'new',state:'pending'});
  expect(JSON.stringify(pending)).not.toMatch(/tw_setup_v1|tw_e_/);
  const setup=JSON.parse(Buffer.from(value.setup_code.split('.')[1]!,'base64url').toString()) as {token:string};
  const result=await enroll(f.db,setup.token,{requestId:randomUUID(),credential:newCredential('agent').value,hostname:'new.example',osId:'debian',osVersion:'13',architecture:'amd64',agentVersion:'0.0.12'},f.ctx.config,f.clock);
  expect(await f.db.selectFrom('fleet_group_hosts').select('group_id').where('host_id','=',result.host_id).execute()).toEqual([{group_id:g.id}]);
  expect(await f.db.selectFrom('fleet_host_tags').select('tag').where('host_id','=',result.host_id).execute()).toEqual([{tag:'eu'}]);
 });
 it('schedules maintenance for multiple servers with distinct windows and independent lifecycle',async()=>{
  const first=await f.db.selectFrom('hosts').selectAll().where('id','=',f.hostId).executeTakeFirstOrThrow(),second=randomUUID();await f.db.insertInto('hosts').values({...first,id:second,label:'Second'}).execute();
  const result=await fleetOperation(f.db,f.session,{request_id:randomUUID(),kind:'maintenance',targets:[{id:f.hostId,revision:'1'},{id:second,revision:'1'}],values:{action:'schedule',starts_at:null,ends_at:new Date(+f.clock()+3600000).toISOString()}},f.clock);
  expect(result.items.map(i=>i.state)).toEqual(['completed','completed']);expect(await f.db.selectFrom('fleet_maintenance').select('id').execute()).toHaveLength(2);
  expect((await readFleet(f.db,f.session,fleetOptions('?maintenance=active'),f.clock)).total).toBe(2);
 });
});
