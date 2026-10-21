import {sql} from "kysely";
import {randomUUID} from "node:crypto";
import {mkdtemp,rm,chmod,readdir} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {notificationFixture,url} from "../../p4b.fixture";
import {importSkillDirectory} from "../../../server/skills/catalog/package-install";
import {setPackageEnabled} from "../../../server/skills/catalog/package-controls";
import {fetchPackageAssignments} from "../../../server/skills/assignments/packages";
import {setPackagePolicy} from "../../../server/skills/settings/package-policies";
import {acceptPackageRun} from "../../../server/skills/results/package-runs";
import {readPackageResults} from "../../../server/skills/results/package-projection";
import {readResources} from "../../../server/skills/resources/inventory";
import {resourceFeature} from "../../../lib/skills/resource-types";
import {runHistory} from "../../../server/history/run";
import {withNotificationLock} from "../../../server/notifications/lock";
import {sampleFamily} from "../../../server/notifications/sampling";
import {updatePackageDefaults} from "../../../server/skills/settings/package-defaults";
import {pruneResourceBatch} from "../../../server/skills/resources/retention";
import fixture from "./fixtures/contract.json";
function barrier(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
async function cleanup(root:string){await chmod(root,0o700);for(const e of await readdir(root,{withFileTypes:true}))if(e.isDirectory())await cleanup(path.join(root,e.name));await rm(root,{recursive:true,force:true});}
describe.skipIf(!url)('Generic resource engine',()=>{
 let f:Awaited<ReturnType<typeof notificationFixture>>,directory:string,store:string,id:string;
 beforeEach(async()=>{
  f=await notificationFixture();directory=await mkdtemp(path.join(os.tmpdir(),'tw-resources-'));store=path.join(directory,'store');
  const skill=await importSkillDirectory(f.db,f.session,{request_id:randomUUID(),directory:path.resolve('tests/skills/resources/fixtures/targets')},f.clock,store);id=skill.installation_id;
  await setPackageEnabled(f.db,f.session,id,{request_id:randomUUID(),expected_enablement_version:'1',content_sha256:skill.content_sha256,enabled:true,grants:[]},f.clock);
 });
 afterEach(async()=>{await f?.db.destroy();if(directory)await cleanup(directory);});
 const assignments=()=>fetchPackageAssignments(f.db,f.agentCredential,true,f.clock,undefined,[resourceFeature]);
 async function run(sequence:number,rows:{key:string;status:string}[]=[],resources:unknown=fixture.inventory){
  const assignment=(await assignments()).assignments[0]!;
  return acceptPackageRun(f.db,f.agentCredential,{protocol_version:2,run_id:randomUUID(),run_sequence:sequence,assignment_id:assignment.assignment_id!,started_at:new Date(f.clock().getTime()-100).toISOString(),finished_at:f.clock().toISOString(),outcome:'observed',observation:{rows},resources},f.clock,store);
 }
 it('keeps old agents on v1 and discovers without turning empty selections healthy',async()=>{
  expect((await fetchPackageAssignments(f.db,f.agentCredential,true,f.clock)).assignments[0]!.applicability).toBe('unavailable');
  expect((await assignments()).assignments[0]!.package_format).toBe(2);
  await run(1);
  expect((await readPackageResults(f.db,f.session,f.hostId,f.clock)).skills[0]!.state).toBe('not_configured');
  const result=await readResources(f.db,f.session,f.hostId,id,'items',{},f.clock);
  expect(result.total).toBe(2);expect(result.selection).toEqual([]);expect(result.fresh).toBe(true);
 });
 it('requires a current inventory and preserves existing membership when another is added',async()=>{
  await run(1);
  let inventory=await readResources(f.db,f.session,f.hostId,id,'items',{},f.clock);
  const save=(targets:string[],version:string,snapshot=inventory.snapshot_id!)=>setPackagePolicy(f.db,f.session,f.hostId,id,{request_id:randomUUID(),expected_default_revision:'1',expected_policy_version:version,overrides:{targets},inventory_snapshots:{items:snapshot}},f.clock,store);
  await expect(save(['a'],'0',randomUUID())).rejects.toMatchObject({code:'settings_conflict'});
  await save(['a'],'0');
  const original=await f.db.selectFrom('skill_resource_memberships').selectAll().where('retired_at','is',null).executeTakeFirstOrThrow();
  await run(2,[{key:'a',status:'critical'}]);
  inventory=await readResources(f.db,f.session,f.hostId,id,'items',{},f.clock);
  await save(['b','a'],'1');
  const active=await f.db.selectFrom('skill_resource_memberships').selectAll().where('retired_at','is',null).execute();
  expect(active).toHaveLength(2);expect(active.find(r=>r.resource_key==='a')!.id).toBe(original.id);
  await run(3,[{key:'a',status:'critical'},{key:'b',status:'healthy'}]);
  const selected=(await readPackageResults(f.db,f.session,f.hostId,f.clock)).skills[0]!;
  expect(selected.state).toBe('critical');expect(selected.assessment!.subjects).toHaveLength(2);
  await save(['b'],'2');expect((await f.db.selectFrom('skill_resource_memberships').selectAll().where('id','=',original.id).executeTakeFirstOrThrow()).retired_at).not.toBeNull();
 });
 it('delivers separate problems and recoveries while aggregate remains critical',async()=>{
  await run(1);
  const inventory=await readResources(f.db,f.session,f.hostId,id,'items',{},f.clock);
  await setPackagePolicy(f.db,f.session,f.hostId,id,{request_id:randomUUID(),expected_default_revision:'1',expected_policy_version:'0',overrides:{targets:['a','b']},inventory_snapshots:{items:inventory.snapshot_id!}},f.clock,store);
  await run(2,[{key:'a',status:'healthy'},{key:'b',status:'healthy'}]);
  await withNotificationLock(f.db,'tinywarden_test_p1b',connection=>sampleFamily(connection,f.routeId,f.settings,f.hostId,'packages',f.clock));
  await runHistory(f.db,'tinywarden_test_p1b',f.clock);
  for(const [offset,states] of [['critical','healthy'],['critical','critical'],['healthy','critical'],['healthy','healthy']].entries()){
   await f.advanceSeconds(60);await run(offset+3,[{key:'a',status:states[0]!},{key:'b',status:states[1]!}]);
   await f.tick();await runHistory(f.db,'tinywarden_test_p1b',f.clock);
  }
  const events=await f.db.selectFrom('notification_outbox as o').innerJoin('notification_cursors as c','c.id','o.cursor_id').select(['c.resource_key','o.to_state','o.state']).where('c.subject_key','=','example/targets').orderBy('o.created_at').execute();
  expect(events.map(e=>[e.resource_key,e.to_state,e.state])).toEqual([['a','critical','captured'],['b','critical','captured'],['a','healthy','captured'],['b','healthy','captured']]);
  expect(f.captured.some(b=>b.toString().includes('Resource'))).toBe(true);
  const history=await f.db.selectFrom('history_events').select(['resource_key','to_state']).where('subject_key','=','example/targets').where('kind','=','state').orderBy('observed_at').execute();
  expect(history.map(e=>[e.resource_key,e.to_state])).toEqual([['a','critical'],['b','critical'],['a','healthy'],['b','healthy']]);
 });
 it('keeps partial and expired inventories from enrolling targets and admits exact retries only once',async()=>{
  await run(1);
  const assignment=(await assignments()).assignments[0]!;
  const input={protocol_version:2 as const,run_id:randomUUID(),run_sequence:2,assignment_id:assignment.assignment_id!,started_at:new Date(f.clock().getTime()-100).toISOString(),finished_at:f.clock().toISOString(),outcome:'observed' as const,observation:{rows:[]},resources:fixture.inventory.map(r=>({...r,complete:false,reason:{key:'running',params:{}}}))};
  await acceptPackageRun(f.db,f.agentCredential,input,f.clock,store);
  await acceptPackageRun(f.db,f.agentCredential,input,f.clock,store);
  expect(await f.db.selectFrom('skill_observations').select('id').where('id','=',input.run_id).execute()).toHaveLength(1);
  let inventory=await readResources(f.db,f.session,f.hostId,id,'items',{},f.clock);
  expect(inventory.complete).toBe(false);
  const save=()=>setPackagePolicy(f.db,f.session,f.hostId,id,{request_id:randomUUID(),expected_default_revision:'1',expected_policy_version:'0',overrides:{targets:['a']},inventory_snapshots:{items:inventory.snapshot_id!}},f.clock,store);
  await expect(save()).rejects.toMatchObject({code:'settings_conflict'});
  await run(3);inventory=await readResources(f.db,f.session,f.hostId,id,'items',{},f.clock);
  await f.advanceSeconds(181);expect((await readResources(f.db,f.session,f.hostId,id,'items',{},f.clock)).fresh).toBe(false);
  await expect(save()).rejects.toMatchObject({code:'settings_conflict'});
  await expect(updatePackageDefaults(f.db,f.session,id,{request_id:randomUUID(),expected_revision:'1',settings:{targets:['a'],interval_seconds:60}},f.clock,store)).rejects.toMatchObject({code:'invalid_request'});
 });
 it('suspends on unknown, preserves an exposed incident through selection changes, and retires without recovery',async()=>{
  await run(1);let version='0';
  const select=async(targets:string[])=>{
   const inventory=await readResources(f.db,f.session,f.hostId,id,'items',{},f.clock);
   await setPackagePolicy(f.db,f.session,f.hostId,id,{request_id:randomUUID(),expected_default_revision:'1',expected_policy_version:version,overrides:{targets},inventory_snapshots:{items:inventory.snapshot_id!}},f.clock,store);version=String(Number(version)+1);
  };
  await select(['a']);await run(2,[{key:'a',status:'critical'}]);await f.tick();
  const old=await f.db.selectFrom('notification_cursors').selectAll().where('resource_key','=','a').where('current','=',true).executeTakeFirstOrThrow();
  await select(['a','b']);await f.advanceSeconds(60);await run(3,[{key:'a',status:'unknown'},{key:'b',status:'healthy'}]);await f.tick();
  const resumed=await f.db.selectFrom('notification_cursors').selectAll().where('resource_key','=','a').where('current','=',true).executeTakeFirstOrThrow();
  expect(resumed.id).toBe(old.id);expect(resumed.exposed).toBe(true);expect(resumed.suspended).toBe(true);
  await f.advanceSeconds(60);await run(4,[{key:'a',status:'critical'},{key:'b',status:'healthy'}]);await f.tick();
  expect(await f.db.selectFrom('notification_outbox').select('id').where('cursor_id','=',old.id).execute()).toHaveLength(1);
  await select(['b']);await f.advanceSeconds(60);await f.tick();
  expect((await f.db.selectFrom('notification_cursors').selectAll().where('id','=',old.id).executeTakeFirstOrThrow()).current).toBe(false);
  expect(await f.db.selectFrom('notification_outbox').select('id').where('cursor_id','=',old.id).execute()).toHaveLength(1);
  await select(['a','b']);
  const member=await f.db.selectFrom('skill_resource_memberships').selectAll().where('resource_key','=','a').where('retired_at','is',null).executeTakeFirstOrThrow();
  expect(member.id).not.toBe(old.resource_epoch);
 });
 it('denies hidden-host inventory and all selection writes to a regular user',async()=>{
  await run(1);
  await f.db.updateTable('operators').set({role:'user'}).execute();
  await expect(readResources(f.db,f.session,f.hostId,id,'items',{},f.clock)).rejects.toMatchObject({status:404});
  await expect(setPackagePolicy(f.db,f.session,f.hostId,id,{request_id:randomUUID(),expected_default_revision:'1',expected_policy_version:'0',overrides:{targets:[]}},f.clock,store)).rejects.toMatchObject({status:403});
 });
 it('expires inventory and unreferenced retired memberships through the existing retention family',async()=>{
  await run(1);const inventory=await readResources(f.db,f.session,f.hostId,id,'items',{},f.clock);
  await setPackagePolicy(f.db,f.session,f.hostId,id,{request_id:randomUUID(),expected_default_revision:'1',expected_policy_version:'0',overrides:{targets:['a']},inventory_snapshots:{items:inventory.snapshot_id!}},f.clock,store);
  await setPackagePolicy(f.db,f.session,f.hostId,id,{request_id:randomUUID(),expected_default_revision:'1',expected_policy_version:'1',overrides:{targets:[]}},f.clock,store);
  const cutoff=new Date(f.clock().getTime()+1);
  expect(await pruneResourceBatch(f.db,cutoff)).toMatchObject({inventories:1,memberships:1});
  expect(await f.db.selectFrom('skill_resource_inventories').select('snapshot_id').execute()).toEqual([]);
  expect(await f.db.selectFrom('skill_resource_memberships').select('id').execute()).toEqual([]);
 });
 it('pages a retired subject backlog and completes each cursor without a recovery',async()=>{
  const members=Array.from({length:130},(_,i)=>({id:randomUUID(),host_id:f.hostId,installation_id:id,collection:'items',resource_key:'old-'+i,label:'old-'+i,created_at:f.clock(),retired_at:f.clock()}));
  await f.db.insertInto('skill_resource_memberships').values(members).execute();
  await f.db.insertInto('notification_cursors').values(members.map(m=>({id:randomUUID(),route_id:f.routeId,host_id:f.hostId,agent_id:f.agentId,generation:1,subject_key:'example/targets',enablement_version:'2',source_revision:'1',policy_version:'0',current:true,sampled_at:f.clock(),resource_collection:m.collection,resource_key:m.resource_key,resource_epoch:m.id,evaluation_revision:'a'.repeat(64),last_state:'critical' as const,suspended:false,exposed:true,transition_number:1}))).execute();
  const sample=()=>withNotificationLock(f.db,'tinywarden_test_p1b',connection=>sampleFamily(connection,f.routeId,f.settings,f.hostId,'packages',f.clock));
  await sample();expect(await f.db.selectFrom('notification_cursors').select('id').where('current','=',false).execute()).toHaveLength(128);
  await sample();expect(await f.db.selectFrom('notification_cursors').select('id').where('current','=',false).execute()).toHaveLength(130);
  expect(await f.db.selectFrom('notification_outbox').select('id').execute()).toHaveLength(0);
 });

 it('fences SDK2 evaluation already in flight and establishes a fresh epoch on resume',async()=>{
  await run(1);const inventory=await readResources(f.db,f.session,f.hostId,id,'items',{},f.clock);
  await setPackagePolicy(f.db,f.session,f.hostId,id,{request_id:randomUUID(),expected_default_revision:'1',expected_policy_version:'0',overrides:{targets:['a']},inventory_snapshots:{items:inventory.snapshot_id!}},f.clock,store);
  const old=(await assignments()).assignments[0]!,input={protocol_version:2 as const,run_id:randomUUID(),run_sequence:2,assignment_id:old.assignment_id!,started_at:f.clock().toISOString(),finished_at:f.clock().toISOString(),outcome:'observed' as const,observation:{rows:[{key:'a',status:'critical'}]},resources:fixture.inventory};
  const prepare=await import('../../../server/skills/results/package-prepare'),interpret=prepare.interpretPackage,entered=barrier(),release=barrier();
  const spy=vi.spyOn(prepare,'interpretPackage').mockImplementation(async(...args)=>{entered.resolve();await release.promise;return interpret(...args);});
  const {controlPoll}=await import('../../../server/fleet/control');const {fleetOperation}=await import('../../../server/fleet/commands');
  await controlPoll(f.db,f.agentCredential,{applied:null},f.clock);
  const pending=acceptPackageRun(f.db,f.agentCredential,input,f.clock,store);
  try{await entered.promise;await fleetOperation(f.db,f.session,{request_id:randomUUID(),kind:'pause',targets:[{id:f.hostId,revision:'1'}],values:{}},f.clock);release.resolve();expect((await pending).current).toBe(false);}finally{release.resolve();spy.mockRestore();}
  expect(await f.db.selectFrom('skill_observations').select('id').execute()).toHaveLength(1);
  expect((await readResources(f.db,f.session,f.hostId,id,'items',{},f.clock)).snapshot_id).toBe(inventory.snapshot_id);
  await fleetOperation(f.db,f.session,{request_id:randomUUID(),kind:'resume',targets:[{id:f.hostId,revision:'2'}],values:{}},f.clock);
  await run(3,[{key:'a',status:'healthy'}]);expect(await f.db.selectFrom('skill_states').select('monitoring_epoch').execute()).toEqual([{monitoring_epoch:'3'}]);
  expect((await readPackageResults(f.db,f.session,f.hostId,f.clock)).skills[0]!.state).toBe('healthy');
 });
 it('purges real SDK2 selected resources and their dependent evidence while preserving the shared skill',async()=>{
  await run(1);const inventory=await readResources(f.db,f.session,f.hostId,id,'items',{},f.clock);
  await setPackagePolicy(f.db,f.session,f.hostId,id,{request_id:randomUUID(),expected_default_revision:'1',expected_policy_version:'0',overrides:{targets:['a']},inventory_snapshots:{items:inventory.snapshot_id!}},f.clock,store);
  await run(2,[{key:'a',status:'critical'}]);await runHistory(f.db,'tinywarden_test_p1b',f.clock);
  expect(await f.db.selectFrom('skill_resource_memberships').select('id').execute()).toHaveLength(1);
  const {removalPreview,fleetOperation}=await import('../../../server/fleet/commands'),{purgeNextBatch}=await import('../../../server/fleet/purge');const targets=[{id:f.hostId,revision:'1'}],preview=await removalPreview(f.db,f.session,'delete',targets,f.clock);
  await fleetOperation(f.db,f.session,{request_id:randomUUID(),kind:'delete',targets,values:{preview:preview.preview}},f.clock);
  for(let n=0;n<120;n++){const job=await f.db.selectFrom('fleet_purge_jobs').selectAll().where('host_id','=',f.hostId).executeTakeFirstOrThrow();expect(job.state,JSON.stringify(job)).not.toBe('failed');if(job.state==='completed')break;expect((await purgeNextBatch(f.db,f.clock)).rows).toBeLessThanOrEqual(100);}
  expect(await f.db.selectFrom('hosts').select('id').execute()).toHaveLength(0);
  expect(await f.db.selectFrom('skill_resource_memberships').select('id').execute()).toHaveLength(0);expect(await f.db.selectFrom('skill_resource_inventories').select('host_id').execute()).toHaveLength(0);
  expect(await f.db.selectFrom('skill_observations').select('id').execute()).toHaveLength(0);expect(await f.db.selectFrom('skill_installations').select('id').execute()).toEqual([{id}]);
 });

 it('serializes retained-policy changes with an in-flight observation commit',async()=>{
  await run(1);
  const {readRetentionSettings,saveRetentionSettings}=await import('../../../server/data/retention-settings'),preview=await readRetentionSettings(f.db,f.session,f.clock,1);
  const capture=await import('../../../server/skills/metrics/capture'),original=capture.captureMetrics,entered=barrier(),release=barrier();
  const spy=vi.spyOn(capture,'captureMetrics').mockImplementation(async(...args)=>{entered.resolve();await release.promise;return original(...args);});
  const pending=run(2);let policy:ReturnType<typeof saveRetentionSettings>|undefined;
  try{await entered.promise;policy=saveRetentionSettings(f.db,f.session,{request_id:randomUUID(),expected_revision:'1',days:1,confirmation:preview.preview!.confirmation},f.clock);
   let waiting=false;const until=performance.now()+1500;
   while(!waiting&&performance.now()<until){waiting=(await sql<{waiting:boolean}>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND datname=current_database() AND wait_event_type='Lock' AND query LIKE '%data_retention_policy%') waiting`.execute(f.db)).rows[0]!.waiting;if(!waiting)await new Promise(resolve=>setTimeout(resolve,25));}
   expect(waiting).toBe(true);release.resolve();expect((await pending).current).toBe(true);expect((await policy).days).toBe(1);
  }finally{release.resolve();spy.mockRestore();await pending;await policy;}
 });

});
