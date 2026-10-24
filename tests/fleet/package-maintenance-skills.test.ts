import {randomUUID} from 'node:crypto';
import {chmod,mkdtemp,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import {notificationFixture,url} from '../p4b.fixture';
import {importSkillDirectory} from '../../server/skills/catalog/package-install';
import {setPackageEnabled} from '../../server/skills/catalog/package-controls';
import {fetchPackageAssignments} from '../../server/skills/assignments/packages';
import {startManualRun} from '../../server/skills/manual/agent';
import {acceptPackageRun} from '../../server/skills/results/package-runs';
import {manualCapability} from '../../server/skills/manual/lifecycle';
import {pruneManualBatch} from '../../server/skills/manual/retention';
import {verificationSnapshot} from '../../server/maintenance/verification';
import {verificationProgress} from '../../server/maintenance/verification-runs';
import type {VerificationSnapshot} from '../../lib/maintenance/contracts';

async function clean(root:string){await chmod(root,0o700);for(const d of await readdir(root,{withFileTypes:true}))if(d.isDirectory())await clean(path.join(root,d.name));await rm(root,{recursive:true,force:true});}
describe.skipIf(!url)('maintenance reuses generic fresh skill collection',()=>{
 let f:Awaited<ReturnType<typeof notificationFixture>>,store:string,installation:string,job:string,actor:string,baseline:VerificationSnapshot,sequence:number;
 const delivery=()=>fetchPackageAssignments(f.db,f.agentCredential,true,f.clock,manualCapability);
 beforeEach(async()=>{
  f=await notificationFixture();store=await mkdtemp(path.join(os.tmpdir(),'tw-maintenance-skills-'));sequence=1;
  const installed=await importSkillDirectory(f.db,f.session,{request_id:randomUUID(),directory:path.join(process.cwd(),'tests/skills/packages/fixtures/memory-pressure')},f.clock,store);
  installation=installed.installation_id;
  const pkg=await f.db.selectFrom('skill_packages').selectAll().where('content_sha256','=',installed.content_sha256).executeTakeFirstOrThrow();
  await setPackageEnabled(f.db,f.session,installation,{request_id:randomUUID(),expected_enablement_version:'1',content_sha256:installed.content_sha256,enabled:true,grants:pkg.metadata.manifest.capabilities},f.clock);
  await delivery();
  await expect(f.db.transaction().execute(trx=>verificationSnapshot(trx,f.hostId,f.clock()))).rejects.toMatchObject({code:'maintenance_health_baseline'});
  const assignment=(await delivery()).assignments[0]!;
  await acceptPackageRun(f.db,f.agentCredential,{run_id:randomUUID(),run_sequence:sequence++,assignment_id:assignment.assignment_id!,started_at:f.clock().toISOString(),finished_at:f.clock().toISOString(),outcome:'observed',observation:{total_bytes:'10000',available_bytes:'1000',used_percent:90}},f.clock,store);
  baseline=await f.db.transaction().execute(trx=>verificationSnapshot(trx,f.hostId,f.clock()));
  expect(baseline.members[0]?.severity).toBe('warning');
  actor=(await f.db.selectFrom('operators').select('id').where('role','=','admin').executeTakeFirstOrThrow()).id;
  const operation=randomUUID();job=randomUUID();
  await f.db.insertInto('fleet_operations').values({id:operation,operator_id:actor,kind:'maintenance_action',fingerprint:Buffer.alloc(32,1),payload:{},created_at:f.clock()}).execute();
  await f.db.insertInto('fleet_operation_items').values({operation_id:operation,host_id:f.hostId,expected_revision:'1',outcome:null,revision:null,completed_at:null}).execute();
  await f.db.insertInto('maintenance_jobs').values({id:job,operation_id:operation,host_id:f.hostId,agent_id:f.agentId,generation:1,action:'packages.upgrade_conservative.v1',provider_version:1,phase:'preparing',reason:null,apply_attempt:null,grant_expires_at:null,apply_started_at:null,plan_id:null,approval_id:null,ordinal:0,result:null,created_at:f.clock(),expires_at:new Date(+f.clock()+86400000),updated_at:f.clock(),completed_at:null}).execute();
 });
 afterEach(async()=>{await f?.db.destroy();if(store)await clean(store);});
 function progress(stage:'baseline'|'post',boundary:Date){return f.db.transaction().execute(trx=>verificationProgress(trx,{job,host:f.hostId,operator:actor,baseline,stage,notBefore:boundary,at:f.clock()}));}
 async function collect(percent=90){
  const assignment=(await delivery()).assignments[0]!,manual=assignment.manual_request!;
  expect(manual).not.toBeNull();const run={manual_request_id:manual.id,run_id:randomUUID(),run_sequence:sequence++,assignment_id:assignment.assignment_id!,started_at:f.clock().toISOString(),finished_at:f.clock().toISOString(),outcome:'observed' as const,observation:{total_bytes:'10000',available_bytes:String(10000-percent*100),used_percent:percent}};
  await startManualRun(f.db,f.agentCredential,{manual_request_id:manual.id,assignment_id:run.assignment_id,run_id:run.run_id,run_sequence:run.run_sequence},f.clock);
  await acceptPackageRun(f.db,f.agentCredential,run,f.clock,store);
  return manual.id;
 }
 it('requires new baseline and post receipts, retains them and preserves a known warning',async()=>{
  await f.advanceSeconds(1);const before=f.clock();
  expect((await progress('baseline',before)).state).toBe('pending');
  const baselineRun=await collect();expect((await progress('baseline',before)).state).toBe('verified');
  await f.advanceSeconds(1);const after=f.clock();
  expect((await progress('post',after)).state).toBe('pending');const postRun=await collect();expect(postRun).not.toBe(baselineRun);
  const result=await progress('post',after);expect(result.state).toBe('verified');
  if(result.state==='verified')expect(result.snapshot.members[0]!.severity).toBe('warning');
  expect(await pruneManualBatch(f.db,new Date(+f.clock()+86400000))).toBe(0);
  expect(await f.db.selectFrom('maintenance_verification_runs').selectAll().where('job_id','=',job).execute()).toHaveLength(2);
 });
 it('fails the post check after a new critical observation without rewriting the old evidence',async()=>{
  await f.advanceSeconds(1);const after=f.clock();expect((await progress('post',after)).state).toBe('pending');
  await collect(99);expect(await progress('post',after)).toMatchObject({state:'failed',reason:'maintenance_health_regression'});
  expect(baseline.members[0]!.severity).toBe('warning');expect(await f.db.selectFrom('skill_observations').select('id').execute()).toHaveLength(2);
 });
});
