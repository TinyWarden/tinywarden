import {mkdtemp,chmod,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {importSkillDirectory} from '../../server/skills/catalog/package-install';
import {setPackageEnabled} from '../../server/skills/catalog/package-controls';
import {fetchPackageAssignments} from '../../server/skills/assignments/packages';
import {acceptPackageRun} from '../../server/skills/results/package-runs';
import {manualCapability} from '../../server/skills/manual/lifecycle';
import {packageProjections} from '../../server/skills/results/package-projection';
import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,it,expect} from 'vitest';
import {lifecycleFixture,resetTestSchema,url} from '../p4a.fixture';
import {actionFixture,readyActionFixture,type AwaitedLifecycle} from './skill-actions.fixture';
import {createMaintenanceOperation} from '../../server/maintenance/operations';
import {maintenanceDelivery} from '../../server/maintenance/delivery';
import {localVerificationSnapshot,assertVerificationCoverage} from '../../server/maintenance/verification';
import {preparationAuthority} from '../../server/maintenance/authority';
import {advanceMaintenance} from '../../server/maintenance/progress';

describe.skipIf(!url)('independent action execution',()=>{
 let f:AwaitedLifecycle,store:string;
 async function clean(root:string){await chmod(root,0o700);for(const d of await readdir(root,{withFileTypes:true}))if(d.isDirectory())await clean(path.join(root,d.name));await rm(root,{recursive:true,force:true});}
 beforeEach(async()=>{await resetTestSchema();f=await lifecycleFixture();store=await mkdtemp(path.join(os.tmpdir(),'tw-pu1-other-'));});
 afterEach(async()=>{await f?.db.destroy();if(store)await clean(store);});
 it.each(['absent','disabled','enabled','unhealthy','stale','updated','reconfigured','removed'])('ignores unrelated skill %s during delivery and settlement',async state=>{
  const source=await actionFixture(f),{input}=await readyActionFixture(f,source);
  const operation=await createMaintenanceOperation(f.db,f.session,input,f.clock);
  let job=await f.db.selectFrom('maintenance_jobs').selectAll().where('operation_id','=',operation.id).executeTakeFirstOrThrow();
  const scope=localVerificationSnapshot(job);
  // An independent installation has no readings and no usable action grant.
  let other:string|undefined;
  if(state!=='absent'){
   const installed=await importSkillDirectory(f.db,f.session,{request_id:randomUUID(),directory:path.join(process.cwd(),'tests/skills/packages/fixtures/memory-pressure')},f.clock,store);
   other=installed.installation_id;
   const pkg=await f.db.selectFrom('skill_packages').selectAll().where('content_sha256','=',installed.content_sha256).executeTakeFirstOrThrow();
   if(state!=='disabled'&&state!=='removed'){
    await setPackageEnabled(f.db,f.session,other,{request_id:randomUUID(),expected_enablement_version:'1',content_sha256:installed.content_sha256,enabled:true,grants:pkg.metadata.manifest.capabilities},f.clock);
    const assignment=(await fetchPackageAssignments(f.db,f.agentCredential,true,f.clock,manualCapability)).assignments.find(a=>a.installation_id===other)!;
    expect(assignment.assignment_id).toBeTruthy();
    const percent=state==='unhealthy'?99:10;
    await acceptPackageRun(f.db,f.agentCredential,{run_id:randomUUID(),run_sequence:1,assignment_id:assignment.assignment_id!,started_at:f.clock().toISOString(),finished_at:f.clock().toISOString(),outcome:'observed',observation:{total_bytes:'10000',available_bytes:String(10000-percent*100),used_percent:percent}},f.clock,store);
    if(state==='stale')await f.db.updateTable('skill_observations').set({evidence_expires_at:new Date(+f.clock()-1000)}).where('installation_id','=',other).execute();
    const projection=await f.db.transaction().execute(async trx=>(await packageProjections(trx,[f.hostId],f.clock())).find(p=>p.installation_id===other));
    expect(projection?.state).toBe(state==='unhealthy'?'critical':state==='stale'?'stale':'healthy');
   }
  }
  await f.db.transaction().execute(async trx=>{await preparationAuthority(trx,job,f.clock());await maintenanceDelivery(trx,job,f.clock());});
  if(other&&state==='reconfigured')await f.db.updateTable('skill_installations').set({settings_revision:'2',defaults:{warning_percent:80,critical_percent:95,interval_seconds:60,timeout_seconds:10,stale_after_seconds:180}}).where('id','=',other).execute();
  if(other&&state==='updated'){
   const installation=await f.db.selectFrom('skill_installations').selectAll().where('id','=',other).executeTakeFirstOrThrow();
   const pkg=await f.db.selectFrom('skill_packages').selectAll().where('content_sha256','=',installation.content_sha256).executeTakeFirstOrThrow();
   const metadata=structuredClone(pkg.metadata),hash='d'.repeat(64);metadata.content_sha256=hash;metadata.manifest.version='1.0.1';
   await f.db.insertInto('skill_packages').values({content_sha256:hash,skill_id:metadata.manifest.id,version:metadata.manifest.version,metadata,unpacked_bytes:pkg.unpacked_bytes,official:false,imported_at:f.clock()}).execute();
   await f.db.updateTable('skill_installations').set({content_sha256:hash,enablement_version:'3'}).where('id','=',other).execute();
  }
  if(state==='removed'&&other){
   // Remove the isolated fixture and its immutable settings/source records only.
   await f.db.deleteFrom('skill_package_mutations').where('installation_id','=',other).execute();
   await f.db.deleteFrom('skill_settings_revisions').where('installation_id','=',other).execute();
   await f.db.deleteFrom('skill_installation_sources').where('installation_id','=',other).execute();
   await f.db.deleteFrom('skill_installations').where('id','=',other).execute();
  }
  job=await f.db.selectFrom('maintenance_jobs').selectAll().where('id','=',job.id).executeTakeFirstOrThrow();
  expect(assertVerificationCoverage(job,scope)).toEqual(scope);
  const plan=randomUUID(),sha='a'.repeat(64),result={effect:'changed' as const,reason:null,local_verified:true,process_running:false,facts:{complete:true}};
  await f.db.insertInto('maintenance_plans').values({id:plan,job_id:job.id,provider_plan:{},verification:scope,provider_sha256:sha,verification_sha256:sha,digest:sha,created_at:f.clock(),expires_at:new Date(+f.clock()+300000)}).execute();
  await f.db.updateTable('maintenance_jobs').set({phase:'verifying',plan_id:plan,apply_attempt:randomUUID(),apply_started_at:f.clock(),result,verification_requested_at:f.clock()}).where('id','=',job.id).execute();
  const completed=await f.db.transaction().execute(async trx=>advanceMaintenance(trx,await trx.selectFrom('maintenance_jobs').selectAll().where('id','=',job.id).executeTakeFirstOrThrow(),f.clock()));
  expect(completed.phase).toBe('succeeded');expect(completed.result).toEqual(result);
  expect(await f.db.selectFrom('maintenance_verification_runs').selectAll().execute()).toEqual([]);
  expect(await f.db.selectFrom('skill_manual_runs').selectAll().execute()).toEqual([]);
 });
});
