import {randomUUID} from 'node:crypto';
import {afterEach,describe,expect,it} from 'vitest';
import {lifecycleFixture,resetTestSchema,url} from '../p4a.fixture';
import {databaseSnapshot,withRestoredFixture} from '../p4a.restore';
import {controlPoll} from '../../server/fleet/control';
import {fleetOperation,removalPreview} from '../../server/fleet/commands';
import {groupCommand} from '../../server/fleet/management';
import {createFleetSetup} from '../../server/fleet/setup';
import {enroll} from '../../server/fleet/enrollment';
import {purgeNextBatch} from '../../server/fleet/purge';
import {retentionPolicy} from '../../server/data/retention-policy';
import {readRetentionSettings,saveRetentionSettings} from '../../server/data/retention-settings';
import {newCredential} from '../../server/validation';

describe.skipIf(!url)('Fleet populated recovery',()=>{
 let f:Awaited<ReturnType<typeof lifecycleFixture>>;
 afterEach(async()=>{await f?.db.destroy();});
 it('restores lifecycle fences, archived identity, organization, expiration and a resumable partial purge',async()=>{
  await resetTestSchema();f=await lifecycleFixture();await f.diskPost(f.disk(1));
  const archived=await lifecycleFixture(),deleting=await lifecycleFixture();
  await archived.db.destroy();await deleting.db.destroy();
  const group=await groupCommand(f.db,f.session,{request_id:randomUUID(),action:'create',id:null,expected_revision:null,name:'Recovery group',description:'Synthetic'},f.clock);
  const act=async(id:string,kind:string,values:Record<string,unknown>={},revision='1')=>{
   const targets=[{id,revision}];
   if(kind==='archive'||kind==='delete')values={preview:(await removalPreview(f.db,f.session,kind,targets,f.clock)).preview};
   return fleetOperation(f.db,f.session,{request_id:randomUUID(),kind,targets,values},f.clock);
  };
  await act(f.hostId,'membership',{add_groups:[group.id],remove_groups:[],add_tags:['recovery'],remove_tags:[]});
  await controlPoll(f.db,f.agentCredential,{applied:null},f.clock);await act(f.hostId,'pause',{},'2');
  await act(archived.hostId,'archive');await act(deleting.hostId,'delete');
  await purgeNextBatch(f.db,f.clock);
  const ticket=await createFleetSetup(f.db,f.session,{request_id:randomUUID(),mode:'restore',label:'Restore',target_host_id:archived.hostId,expected_revision:'2',groups:[],tags:[]},f.ctx.config.origin,f.clock);
  const preview=await readRetentionSettings(f.db,f.session,f.clock,30);
  const saved=await saveRetentionSettings(f.db,f.session,{request_id:randomUUID(),expected_revision:'1',days:30,confirmation:preview.preview!.confirmation},f.clock);
  const counts=await databaseSnapshot(f.db),job=await f.db.selectFrom('fleet_purge_jobs').selectAll().executeTakeFirstOrThrow();
  expect(job.state).not.toBe('completed');
  await withRestoredFixture(url!,async db=>{
   expect(await databaseSnapshot(db)).toEqual(counts);
   expect(await db.selectFrom('fleet_group_hosts').selectAll().execute()).toEqual([{host_id:f.hostId,group_id:group.id}]);
   expect(await db.selectFrom('hosts').select(['lifecycle','monitoring_epoch']).where('id','=',f.hostId).executeTakeFirst()).toEqual({lifecycle:'paused',monitoring_epoch:'2'});
   expect((await controlPoll(db,f.agentCredential,{applied:{epoch:'2',mode:'paused'}},f.clock)).mode).toBe('paused');
   await expect(controlPoll(db,archived.agentCredential,{applied:null},f.clock)).rejects.toMatchObject({code:'unauthorized'});
   await expect(controlPoll(db,deleting.agentCredential,{applied:null},f.clock)).rejects.toMatchObject({code:'unauthorized'});
   const p=await db.transaction().execute(trx=>retentionPolicy(trx,f.clock()));expect(p.days).toBe(30);expect(p.cutoff.toISOString()).toBe(saved.cutoff);
   const setup=JSON.parse(Buffer.from(ticket.setup_code.split('.')[1]!,'base64url').toString()) as {token:string};
   const restored=await enroll(db,setup.token,{requestId:randomUUID(),credential:newCredential('agent').value,hostname:'restored.example',osId:'debian',osVersion:'13',architecture:'amd64',agentVersion:'0.0.12'},f.ctx.config,f.clock);
   expect(restored).toMatchObject({host_id:archived.hostId,agent_id:archived.agentId,generation:2});
   for(let n=0;n<100;n++){const next=await purgeNextBatch(db,f.clock);expect(next.rows).toBeLessThanOrEqual(100);if(next.completed)break;}
   expect(await db.selectFrom('fleet_purge_jobs').select(['state','error']).where('host_id','=',deleting.hostId).executeTakeFirst()).toEqual({state:'completed',error:null});
   expect(await db.selectFrom('hosts').select('id').where('id','=',deleting.hostId).executeTakeFirst()).toBeUndefined();
   expect(await db.selectFrom('disk_runs').select('host_id').execute()).toEqual([{host_id:f.hostId}]);
   expect(await db.selectFrom('agents').select('current_generation').where('id','=',f.agentId).executeTakeFirst()).toEqual({current_generation:'1'});
  });
  expect((await f.db.selectFrom('fleet_purge_jobs').select('state').where('host_id','=',deleting.hostId).executeTakeFirst())!.state).toBe(job.state);
 },30000);
});
