import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {lifecycleFixture,resetTestSchema,url} from '../p4a.fixture';
import signed from '../fixtures/remote-update-releases.json';
import {verifyRelease} from '../../server/agent-updates/release';
import {agentUpdateRequest} from '../../server/agent-updates/request-api';
import {fleetOperation,readOperation,removalPreview} from '../../server/fleet/commands';
import {fleetOptions,readFleet} from '../../server/fleet/list';
import {agentUpdateRequests,agentSetup,agentUpdatePolicy} from '../../server/http/agent-update-handlers';
import {createFleetSetup} from '../../server/fleet/setup';
import {newCredential} from '../../server/validation';
import type {PlatformObservation} from '../../lib/agent-updates';

describe.skipIf(!url)('Fleet signed update requests',()=>{
 let f:Awaited<ReturnType<typeof lifecycleFixture>>;
 const releases=signed.releases.map(r=>({...r,metadata:verifyRelease(Buffer.from(r.manifest),r.signature)}));
 const old=releases[0]!,next=releases[1]!;
 const observation=(version=old.metadata):PlatformObservation=>({version:version.version,installed_version:version.version,managed:true,remote_updates:true,local_automatic:false,
  binary_sha256:version.binary_sha256,runtime_sha256:version.runtime_sha256,descriptor_sha256:version.descriptor_sha256,updater:{outcome:'idle'}});
 beforeEach(async()=>{
  await resetTestSchema();f=await lifecycleFixture();
  await f.db.updateTable('hosts').set({os_id:'debian',os_version:'13',architecture:'amd64'}).where('id','=',f.hostId).execute();
  for(const r of releases)await f.db.insertInto('agent_release_catalog').values({version:r.version,manifest:r.manifest,signature:r.signature,metadata:r.metadata,verified_at:f.clock()}).execute();
  await f.db.updateTable('agent_release_catalog_state').set({checked_at:f.clock(),verified_at:f.clock(),error:null}).execute();
  await f.db.insertInto('agent_platform_reports').values({agent_id:f.agentId,generation:1,sequence:1,observed_at:f.clock(),received_at:f.clock(),observation:observation()}).execute();
 });
 afterEach(async()=>{await f?.db.destroy();});
 const input=(version:string|null=next.version,request_id=randomUUID(),revision='1')=>({request_id,kind:'update',targets:[{id:f.hostId,revision}],values:{versions:[{id:f.hostId,version}]}});
 const queue=(v=input())=>fleetOperation(f.db,f.session,v,f.clock);
 const poll=(id:string|null=null,state='poll',error:string|null=null,extra:Record<string,unknown>={})=>agentUpdateRequest(f.db,f.agentCredential,{schema_version:1,host_id:f.hostId,agent_id:f.agentId,generation:1,request_id:id,state,error,...extra},f.clock);
 const report=(value:PlatformObservation)=>f.db.updateTable('agent_platform_reports').set({observation:value,received_at:f.clock(),observed_at:f.clock()}).where('agent_id','=',f.agentId).execute();
 it('pins one signed target, preserves exact retry and only completes after fresh process evidence',async()=>{
  await f.db.updateTable('agent_update_defaults').set({automatic:false}).execute();
  const v=input(),op=await queue(v),job=(await poll()).request!;
  expect(op.items[0]).toMatchObject({state:'pending',outcome:'update_queued',revision:'2'});
  expect(job).toMatchObject({state:'queued',candidate:{manifest:next.manifest,signature:next.signature}});
  expect((await queue(v)).items[0]?.state).toBe('pending');
  expect(await f.db.selectFrom('agent_update_requests').select('id').execute()).toHaveLength(1);
  await expect(queue({...v,values:{versions:[{id:f.hostId,version:old.version}]}})).rejects.toMatchObject({code:'idempotency_conflict'});
  await expect(poll(job.id,'succeeded')).rejects.toMatchObject({code:'update_confirmation_required'});
  await poll(job.id,'installing');await f.advance(new Date(+f.clock()+1000));
  await expect(poll(job.id,'succeeded')).rejects.toMatchObject({code:'update_confirmation_required'});
  await report(observation(next.metadata));await poll(job.id,'confirming');
  expect((await poll(job.id,'installing')).request?.state).toBe('confirming');
  expect((await poll(job.id,'succeeded')).request?.state).toBe('succeeded');
  expect((await poll(job.id,'succeeded')).request?.state).toBe('succeeded');
  expect((await readOperation(f.db,f.session,v.request_id,f.clock)).items[0]?.state).toBe('completed');
  expect((await poll()).request).toBeNull();
 });
 it('does not let another operation overlap, and binds scope, target and body',async()=>{
  const op=await queue(),job=(await poll()).request!;
  expect((await queue(input(next.version,randomUUID(),'2'))).items[0]).toMatchObject({state:'failed',outcome:'update_in_progress'});
  await expect(poll(job.id,'poll',null,{generation:2})).rejects.toMatchObject({code:'unauthorized'});
  await expect(poll(job.id,'poll',null,{host_id:randomUUID()})).rejects.toMatchObject({code:'unauthorized'});
  await expect(poll(randomUUID())).rejects.toMatchObject({code:'update_request_unknown'});
  await expect(poll(job.id,'poll',null,{url:'https://example.org'})).rejects.toMatchObject({code:'invalid_request'});
  await expect(poll(job.id,'failed','arbitrary')).rejects.toMatchObject({code:'invalid_request'});
  await poll(job.id,'failed','update_failed');
  expect((await readOperation(f.db,f.session,op.id,f.clock)).items[0]?.outcome).toBe('update_failed');
 });
 it('expires an offline request and never treats enqueue as success',async()=>{
  const op=await queue();await f.advance(new Date(+f.clock()+86400001));
  const result=await readOperation(f.db,f.session,op.id,f.clock);
  expect(result.items[0]).toMatchObject({state:'failed',outcome:'update_expired'});
  expect((await poll()).request).toBeNull();
 });
 it('cancels old identity or revoked operator authority at delivery',async()=>{
  await queue();const actor=await f.db.selectFrom('fleet_operations').select('operator_id').executeTakeFirstOrThrow();
  await f.db.updateTable('operators').set({disabled_at:f.clock()}).where('id','=',actor.operator_id).execute();
  expect((await poll()).request).toBeNull();
  expect((await f.db.selectFrom('agent_update_requests').selectAll().executeTakeFirst())?.error).toBe('update_scope_changed');
 });
 it('invalidates a generation change before delivering a target',async()=>{
  await queue();await f.db.updateTable('agents').set({current_generation:2}).where('id','=',f.agentId).execute();
  await expect(poll()).rejects.toMatchObject({code:'unauthorized'});
  const op=await f.db.selectFrom('fleet_operations').select('id').executeTakeFirstOrThrow();
  expect((await readOperation(f.db,f.session,op.id,f.clock)).items[0]?.outcome).toBe('update_scope_changed');
 });
 it('handles unsupported and already current targets independently in a selected batch',async()=>{
  const host=await f.db.selectFrom('hosts').selectAll().where('id','=',f.hostId).executeTakeFirstOrThrow(),second=randomUUID();
  await f.db.insertInto('hosts').values({...host,id:second,label:'Unsupported'}).execute();
  const v=input();v.targets.push({id:second,revision:'1'});v.values.versions.push({id:second,version:null});
  const result=await queue(v);expect(result.items.find(i=>i.host_id===f.hostId)?.state).toBe('pending');
  expect(result.items.find(i=>i.host_id===second)).toMatchObject({state:'failed',outcome:'update_host_ineligible'});
  await poll((await poll()).request!.id,'failed','update_failed');await report(observation(next.metadata));
  expect((await queue(input(null,randomUUID(),'2'))).items[0]).toMatchObject({state:'not_applicable',outcome:'update_already_current'});
 });
 it('exposes capability reasons and rejects missing capability, stale catalogue and altered signatures',async()=>{
  await report({...observation(),remote_updates:false});
  expect((await readFleet(f.db,f.session,fleetOptions(''),f.clock)).hosts[0]?.update?.reason).toBe('update_agent_upgrade_required');
  expect((await queue()).items[0]?.outcome).toBe('update_agent_upgrade_required');
  await report(observation());await f.db.updateTable('agent_release_catalog_state').set({error:'github_unavailable'}).execute();
  expect((await queue()).items[0]?.outcome).toBe('update_catalog_unavailable');
  await f.db.updateTable('agent_release_catalog_state').set({error:null}).execute();
  expect((await queue(input('99.0.0'))).items[0]?.outcome).toBe('update_target_changed');
  await f.db.updateTable('agent_release_catalog').set({signature:'A'.repeat(88)}).where('version','=',next.version).execute();
  expect((await queue()).items[0]?.outcome).toBe('update_identity_unverified');
 });
 it('allows paused servers and cancels on archival without losing the operation receipt',async()=>{
  await f.db.updateTable('hosts').set({lifecycle:'paused'}).where('id','=',f.hostId).execute();
  const op=await queue();const preview=await removalPreview(f.db,f.session,'archive',[{id:f.hostId,revision:'2'}],f.clock);
  await fleetOperation(f.db,f.session,{request_id:randomUUID(),kind:'archive',targets:[{id:f.hostId,revision:'2'}],values:{preview:preview.preview}},f.clock);
  expect((await readOperation(f.db,f.session,op.id,f.clock)).items[0]?.outcome).toBe('update_scope_changed');
  await expect(poll()).rejects.toMatchObject({code:'unauthorized'});
 });
 it('serializes overlapping enqueue and delivery with metadata writes',async()=>{
  const attempts=await Promise.allSettled([queue(),queue()]);
  expect(attempts.filter(r=>r.status==='fulfilled'&&r.value.items[0]?.state==='pending')).toHaveLength(1);
  expect(await f.db.selectFrom('agent_update_requests').select('id').execute()).toHaveLength(1);
  const [delivery,metadata]=await Promise.all([poll(),fleetOperation(f.db,f.session,{request_id:randomUUID(),kind:'metadata',targets:[{id:f.hostId,revision:'2'}],values:{label:'Renamed',description:'',owner_notes:'',groups:[],tags:[]}},f.clock)]);
  expect(delivery.request?.state).toBe('queued');expect(metadata.items[0]?.state).toBe('completed');
  expect((await f.db.selectFrom('hosts').select('fleet_revision').where('id','=',f.hostId).executeTakeFirst())?.fleet_revision).toBe('3');
 });
 it('authenticates the HTTP root as an agent and rejects browser/query/oversized input',async()=>{
  await queue();const raw={schema_version:1,host_id:f.hostId,agent_id:f.agentId,generation:1,request_id:null,state:'poll',error:null};
  const endpoint='/api/v1/agent/update-requests';
  const rootRequest=(path:string,body:unknown,credential=f.agentCredential)=>{const r=f.req(path,body,credential);r.headers.delete('Origin');return r;};
  const accepted=await agentUpdateRequests(rootRequest(endpoint,raw),f.ctx);expect(accepted.status).toBe(200);
  expect((await accepted.json()).request.state).toBe('queued');
  const origin=rootRequest(endpoint,raw);origin.headers.set('Origin',f.ctx.config.origin);
  expect((await agentUpdateRequests(origin,f.ctx)).status).toBe(400);
  expect((await agentUpdateRequests(rootRequest(endpoint+'?unexpected=1',raw),f.ctx)).status).toBe(400);
  expect((await agentUpdateRequests(rootRequest(endpoint,raw,'invalid'),f.ctx)).status).toBe(401);
  expect((await agentUpdateRequests(rootRequest(endpoint,{...raw,padding:'x'.repeat(5000)}),f.ctx)).status).toBe(413);
 });
 it('negotiates the same complete capability set for fresh installation and existing updater policy',async()=>{
  const code=await createFleetSetup(f.db,f.session,{request_id:randomUUID(),mode:'new',label:'New server',target_host_id:null,expected_revision:null,groups:[],tags:[]},f.ctx.config.origin,f.clock);
  const token=JSON.parse(Buffer.from(code.setup_code.split('.')[1]!,'base64url').toString()).token as string;
  const setup=await agentSetup(f.req('/api/v1/agent/setup',{schema_version:1},token),f.ctx);expect(setup.status).toBe(200);
  const policy=await agentUpdatePolicy(f.req('/api/v1/agent/update-policy',{schema_version:1,host_id:f.hostId,agent_id:f.agentId,generation:1,version:old.version,managed:true},f.agentCredential),f.ctx);expect(policy.status).toBe(200);
  const capabilities=(await setup.json()).capabilities;expect(capabilities).toEqual(['agent_updates.v1','agent_update_requests.v1']);expect((await policy.json()).capabilities).toEqual(capabilities);
 });
 it('requires administrator authority and exact version entries for every explicit target',async()=>{
  const credential=newCredential('session'),id=randomUUID();
  await f.db.insertInto('operators').values({id,login:'reader',role:'user',recovery_admin:false,disabled_at:null,auth_version:1,created_at:f.clock()}).execute();
  await f.db.insertInto('operator_sessions').values({id:credential.id,operator_id:id,secret_digest:credential.digest,auth_version:1,issued_at:f.clock(),last_seen_at:f.clock(),expires_at:new Date(+f.clock()+3600000)}).execute();
  await expect(fleetOperation(f.db,credential.value,input(),f.clock)).rejects.toMatchObject({code:'forbidden'});
  await expect(queue({...input(),values:{versions:[]}})).rejects.toMatchObject({code:'invalid_request'});
  expect(await f.db.selectFrom('agent_update_requests').select('id').execute()).toHaveLength(0);
 });
});
