import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {lifecycleFixture,resetTestSchema,url} from '../p4a.fixture';
import signed from '../fixtures/remote-update-releases.json';
import {verifyRelease} from '../../server/agent-updates/release';
import {operatorAgentUpdates} from '../../server/http/agent-update-handlers';
import {maintenanceActions} from '../../lib/maintenance/policy';
import {validActionReadiness,type ActionReadinessDetails} from '../../lib/maintenance/readiness';
import type {PlatformObservation} from '../../lib/agent-updates';

describe.skipIf(!url)('maintenance readiness in server Agent details',()=>{
 let f:Awaited<ReturnType<typeof lifecycleFixture>>,observation:PlatformObservation;
 beforeEach(async()=>{
  await resetTestSchema();f=await lifecycleFixture();
  const release=signed.releases[0]!,metadata=verifyRelease(Buffer.from(release.manifest),release.signature);
  await f.db.updateTable('hosts').set({os_id:'debian',os_version:'13',architecture:'amd64'}).where('id','=',f.hostId).execute();
  await f.db.insertInto('agent_release_catalog').values({version:release.version,manifest:release.manifest,signature:release.signature,metadata,verified_at:f.clock()}).execute();
  await f.db.updateTable('agent_release_catalog_state').set({checked_at:f.clock(),verified_at:f.clock(),error:null}).execute();
  observation={version:metadata.version,installed_version:metadata.version,managed:true,remote_updates:true,local_automatic:false,
   binary_sha256:metadata.binary_sha256,runtime_sha256:metadata.runtime_sha256,descriptor_sha256:metadata.descriptor_sha256,updater:{outcome:'idle'},
   maintenance:{capability:'maintenance_jobs.v1',worker_ready:true,actions:maintenanceActions.map(a=>({id:a.id,ready:true,missing:[]}))}};
  await f.db.insertInto('agent_platform_reports').values({agent_id:f.agentId,generation:1,sequence:1,observed_at:f.clock(),received_at:f.clock(),observation}).execute();
 });
 afterEach(async()=>{await f?.db.destroy();});
 const get=()=>operatorAgentUpdates(f.req(`/api/v1/operator/hosts/${f.hostId}/agent-updates`,undefined,undefined,f.session),f.hostId,f.ctx);
 async function save(){await f.db.updateTable('agent_platform_reports').set({observation}).where('agent_id','=',f.agentId).execute();}
 async function read(){const response=await get();expect(response.status).toBe(200);const body=await response.json();
  expect(body.access.account_id).toBeTruthy();expect(validActionReadiness(body.maintenance_actions)).toBe(true);
  return body as {maintenance_actions:ActionReadinessDetails;valid_until:string;maintenance:{state:string}};}
 it('shows ready actions without enqueueing work or changing agent update policy',async()=>{
  const body=await read();expect(body.maintenance_actions.actions.map(a=>a.state)).toEqual(['ready','ready']);
  expect(body.valid_until).toBe(new Date(+f.clock()+180000).toISOString());
  expect(body.maintenance.state).toBe('current');
  expect(await f.db.selectFrom('maintenance_jobs').select('id').execute()).toHaveLength(0);
  expect(await f.db.selectFrom('host_agent_update_policies').select('host_id').execute()).toHaveLength(0);
 });
 it.each([['python3-apt'],['apt-get','python3-apt']])('exposes only actually missing packages: %s',async(...missing)=>{
  for(const action of observation.maintenance!.actions){action.ready=false;action.missing=missing;}
  await save();const {maintenance_actions}=await read();
  for(const action of maintenance_actions.actions){expect(action.state).toBe('missing_prerequisites');expect(action.missing_packages).toEqual(missing.map(p=>p==='apt-get'?'apt':p));}
  expect(maintenance_actions.actions[0]!.missing_packages).not.toContain('apt-get');
 });
 it.each(['stale','future','absent','unrecognized','old_agent','worker','catalogue'] as const)('distinguishes %s without inventing missing packages',async kind=>{
  for(const action of observation.maintenance!.actions){action.ready=false;action.missing=['python3-apt'];}
  if(kind==='unrecognized')observation.binary_sha256='f'.repeat(64);
  if(kind==='old_agent')delete observation.maintenance;
  if(kind==='worker')observation.maintenance!.worker_ready=false;
  await save();
  if(kind==='stale'||kind==='future')await f.db.updateTable('agent_platform_reports').set({observed_at:new Date(+f.clock()+(kind==='stale'?-181000:1000))}).where('agent_id','=',f.agentId).execute();
  if(kind==='absent')await f.db.deleteFrom('agent_platform_reports').where('agent_id','=',f.agentId).execute();
  if(kind==='catalogue')await f.db.updateTable('agent_release_catalog_state').set({verified_at:new Date(+f.clock()-86400001)}).execute();
  const expected={stale:'stale',future:'unknown',absent:'unknown',unrecognized:'unrecognized',old_agent:'unsupported_agent',worker:'worker_unavailable',catalogue:'catalog_unavailable'}[kind];
  for(const action of (await read()).maintenance_actions.actions){expect(action.state).toBe(expected);expect(action.missing_packages).toEqual([]);}
 });
 it('reports paused, unsupported and busy causes without recommending a different agent',async()=>{
  await f.db.updateTable('hosts').set({lifecycle:'paused'}).where('id','=',f.hostId).execute();
  expect((await read()).maintenance_actions.actions.map(a=>a.state)).toEqual(['ready','monitoring_paused']);
  observation.updater.outcome='installing';await save();
  expect((await read()).maintenance_actions.actions.map(a=>a.state)).toEqual(['busy','busy']);
  observation.updater.outcome='idle';await save();
  await f.db.updateTable('hosts').set({os_version:'12'}).where('id','=',f.hostId).execute();
  expect((await read()).maintenance_actions.actions.map(a=>a.state)).toEqual(['platform_unsupported','platform_unsupported']);
 });
 it('enforces existing host access and current session authority',async()=>{
  const actor=await f.db.selectFrom('operators').select('id').where('role','=','admin').executeTakeFirstOrThrow();
  await f.db.updateTable('operators').set({role:'user'}).where('id','=',actor.id).execute();
  try{
   expect((await get()).status).toBe(404);
   await f.db.insertInto('access_user_hosts').values({operator_id:actor.id,host_id:f.hostId}).execute();
   expect((await get()).status).toBe(200);
   await f.db.updateTable('operators').set({disabled_at:f.clock()}).where('id','=',actor.id).execute();
   expect((await get()).status).toBe(401);
  }finally{await f.db.updateTable('operators').set({role:'admin',disabled_at:null}).where('id','=',actor.id).execute();}
 });
 it('rejects unsafe or contradictory browser readiness projections',async()=>{
  const value=(await read()).maintenance_actions;
  expect(validActionReadiness({...value,actions:[value.actions[0],value.actions[0]]})).toBe(false);
  expect(validActionReadiness({...value,actions:value.actions.map(a=>({...a,state:'missing_prerequisites',missing_packages:['curl;bad']}))})).toBe(false);
  expect(validActionReadiness({...value,actions:value.actions.map(a=>({...a,missing_packages:['apt']}))})).toBe(false);
 });
});
