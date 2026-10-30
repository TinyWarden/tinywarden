import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,it,expect} from 'vitest';
import {lifecycleFixture,resetTestSchema,url} from '../p4a.fixture';
import {actionFixture,readyActionFixture,type AwaitedLifecycle} from './skill-actions.fixture';
import {createMaintenanceOperation} from '../../server/maintenance/operations';
import {appendActionLogs,readActionLogs} from '../../server/maintenance/action-logs';
import {agentActionLogs} from '../../server/http/action-log-handlers';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {actionTranscriptText} from '../../components/skills/action-log';

describe.skipIf(!url)('independent action diagnostic transport',()=>{
 let f:AwaitedLifecycle;
 beforeEach(async()=>{await resetTestSchema();f=await lifecycleFixture();});
 afterEach(async()=>{await f?.db.destroy();});
 async function prepared(){
  const source=await actionFixture(f),{input}=await readyActionFixture(f,source);
  const operation=await createMaintenanceOperation(f.db,f.session,input,f.clock);
  const job=await f.db.updateTable('maintenance_jobs').set({delivered_at:f.clock(),phase:'preparing'}).where('operation_id','=',operation.id).returningAll().executeTakeFirstOrThrow();
  const entry={sequence:1,phase:'prepare',level:'info',code:'phase_started'};
  const request={schema_version:1,job_id:job.id,scope:{host_id:f.hostId,agent_id:f.agentId,generation:1},binding:job.action_binding,entries:[entry]};
  return {source,operation,job,entry,request};
 }
 it('persists and replays logs without advancing work, contact or authority',async()=>{
  const {operation,job,request}=await prepared();
  const credentialBefore=await f.db.selectFrom('agent_credentials').selectAll().where('agent_id','=',f.agentId).execute();
  await appendActionLogs(f.db,f.agentCredential,request,f.clock);
  await appendActionLogs(f.db,f.agentCredential,request,f.clock);
  expect(await f.db.selectFrom('maintenance_logs').selectAll().execute()).toHaveLength(1);
  expect(await f.db.selectFrom('maintenance_jobs').selectAll().where('id','=',job.id).executeTakeFirst()).toEqual(job);
  expect(await f.db.selectFrom('agent_credentials').selectAll().where('agent_id','=',f.agentId).execute()).toEqual(credentialBefore);
  const read=await readActionLogs(f.db,f.session,operation.id,job.id,'',f.clock);
  expect(read.detailed).toBe(true);expect(read.rows.at(-1)?.code).toBe('phase_started');
  expect(JSON.stringify(read)).not.toContain('binding');expect(JSON.stringify(read)).not.toContain('input_json');
 });
 it('rejects altered replay, wrong binding, generation and job scope',async()=>{
  const {request,entry}=await prepared();
  await appendActionLogs(f.db,f.agentCredential,request,f.clock);
  await expect(appendActionLogs(f.db,f.agentCredential,{...request,entries:[{...entry,code:'phase_completed'}]},f.clock)).rejects.toMatchObject({code:'idempotency_conflict'});
  for(const change of [{job_id:randomUUID()},{scope:{...request.scope,generation:2}},{binding:{...request.binding!,content_sha256:'a'.repeat(64)}}]){
   await expect(appendActionLogs(f.db,f.agentCredential,{...request,...change},f.clock)).rejects.toBeDefined();
  }
 });
 it('rejects arbitrary output, unknown diagnostics and messages outside the pinned catalogue',async()=>{
  const {request,entry}=await prepared();
  for(const value of [{...entry,stderr:'secret'}, {...entry,code:'private raw error'}, {...entry,sequence:1025},
   {sequence:1,phase:'prepare',level:'info',message:{key:'private',params:{}}}]){
   await expect(appendActionLogs(f.db,f.agentCredential,{...request,entries:[value]},f.clock)).rejects.toBeDefined();
  }
  expect(await f.db.selectFrom('maintenance_logs').selectAll().execute()).toEqual([]);
 });
 it('delivers real harmless native output through immutable storage into the full transcript',async()=>{
  const {request,job,operation}=await prepared(),directory=mkdtempSync(resolve(tmpdir(),'tw-transcript-'));
  try{
   execFileSync('/usr/bin/python3',['-I','-B','-c',String.raw`
import os,sys,subprocess,shlex
from pathlib import Path
sys.path.insert(0,sys.argv[1])
from actions.logging import ActionLogger
from actions.output import OutputCapture
from actions.guardian import supervise
from actions.guest import Context
root=Path(sys.argv[2]);fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY)
logger=ActionLogger(fd,"apply",{});capture=OutputCapture(logger)
def action():
    log=Context({"binding":{},"scope":{},"job_id":"fixture","phase":"apply","start":None,"plan_sha256":None},lambda v:None,{"descriptor":{"execution_class":"host_admin"}},{},fd,root,{})
    argv=["/bin/sh","-c","printf 'E: native fixture failure\\n' >&2; exit 7"]
    log.output(shlex.join(argv),"command")
    result=subprocess.run(argv)
    print("buffered Python detail")
    log.output(str(result.returncode),"exit")
assert supervise(action,"apply",capture)==0
`,resolve('runtime/skills'),directory],{timeout:10000,stdio:'pipe'});
   const entries=readFileSync(resolve(directory,'operation-log.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
   await appendActionLogs(f.db,f.agentCredential,{...request,entries},f.clock);
   const read=await readActionLogs(f.db,f.session,operation.id,job.id,'?copy=1',f.clock),transcript=actionTranscriptText(read.rows);
   expect(transcript).toContain('$ /bin/sh');expect(transcript).toContain('E: native fixture failure');expect(transcript).toContain('[exit 7]');
   expect(transcript.indexOf('buffered Python detail')).toBeGreaterThan(-1);
   expect(transcript.indexOf('buffered Python detail')).toBeLessThan(transcript.indexOf('[exit 7]'));
   expect(transcript.indexOf('E: native fixture failure')).toBeLessThan(transcript.indexOf('[exit 7]'));
   expect(transcript).not.toContain('Request saved.');
   await appendActionLogs(f.db,f.agentCredential,{...request,entries},f.clock);
   expect(await f.db.selectFrom('maintenance_logs').selectAll().execute()).toHaveLength(entries.length);
   expect(await f.db.selectFrom('maintenance_jobs').selectAll().where('id','=',job.id).executeTakeFirst()).toEqual(job);
  }finally{rmSync(directory,{recursive:true,force:true});}
 });
 it('accepts the expanded retained limit and rejects malformed or conflicting native output',async()=>{
  const {request,job,operation}=await prepared();
  const output={sequence:1,phase:'apply',level:'error',output:{stream:'stderr',text:'<script>literal</script>\nE: failure\n'}};
  await appendActionLogs(f.db,f.agentCredential,{...request,entries:[output,{sequence:1024,phase:'apply',level:'warning',code:'log_truncated'}]},f.clock);
  const read=await readActionLogs(f.db,f.session,operation.id,job.id,'?copy=1',f.clock);
  expect(actionTranscriptText(read.rows)).toContain('<script>literal</script>');expect(actionTranscriptText(read.rows)).toContain('omitted');
  for(const invalid of [{...output,output:{stream:'execute',text:'no'}},{...output,output:{stream:'stderr',text:'\u0000'}},{...output,code:'phase_started'},
   {...output,output:{stream:'stderr',text:'x'.repeat(1024)}}]){
   await expect(appendActionLogs(f.db,f.agentCredential,{...request,entries:[invalid]},f.clock)).rejects.toBeDefined();
  }
 });
 it('shows catalogue-owned messages, stable older pages and full explicit copy projection',async()=>{
  const {source,job,operation,request}=await prepared();
  const key=Object.keys(source.metadata.catalog).find(k=>!Object.keys(source.metadata.catalog[k]!.parameters).length)!;
  const records=Array.from({length:30},(_,i)=>({sequence:i+1,phase:'prepare',level:'info',message:{key,params:{}}}));
  await appendActionLogs(f.db,f.agentCredential,{...request,entries:records},f.clock);
  const first=await readActionLogs(f.db,f.session,operation.id,job.id,'?page=1',f.clock);
  expect(first.rows).toHaveLength(25);expect(first.rows[2]?.message).toBe(source.metadata.catalog[key]!.text);
  const latest=await readActionLogs(f.db,f.session,operation.id,job.id,'',f.clock);
  expect(latest.page).toBe(2);
  const all=await readActionLogs(f.db,f.session,operation.id,job.id,'?copy=1',f.clock);
  expect(all.rows).toHaveLength(32);
  await appendActionLogs(f.db,f.agentCredential,{...request,entries:[{...records[0],sequence:31}]},f.clock);
  expect((await readActionLogs(f.db,f.session,operation.id,job.id,'?page=1',f.clock)).rows).toEqual(first.rows);
 });
 it('keeps diagnostics after action revocation without granting execution or changing a terminal result',async()=>{
  const {request,job,operation}=await prepared();
  await f.db.updateTable('skill_action_grants').set({enabled:false}).execute();
  await f.db.updateTable('maintenance_jobs').set({phase:'failed',completed_at:f.clock(),reason:'maintenance_worker_interrupted'}).where('id','=',job.id).execute();
  await appendActionLogs(f.db,f.agentCredential,request,f.clock);
  expect((await readActionLogs(f.db,f.session,operation.id,job.id,'',f.clock)).settled).toBe(true);
  expect((await f.db.selectFrom('maintenance_jobs').select(['phase','reason','apply_attempt']).where('id','=',job.id).executeTakeFirst())?.apply_attempt).toBeNull();
 });
 it('refuses undelivered jobs, revoked agent credentials and cross-operation reads',async()=>{
  const {request,job}=await prepared();
  await expect(readActionLogs(f.db,f.session,randomUUID(),job.id,'',f.clock)).rejects.toMatchObject({code:'not_found'});
  await f.db.updateTable('maintenance_jobs').set({delivered_at:null}).where('id','=',job.id).execute();
  await expect(appendActionLogs(f.db,f.agentCredential,request,f.clock)).rejects.toMatchObject({code:'maintenance_scope_changed'});
  await f.db.updateTable('agent_credentials').set({revoked_at:f.clock()}).where('agent_id','=',f.agentId).execute();
  const response=await agentActionLogs(f.req('/api/v2/agent/action-logs',request,f.agentCredential),f.ctx);
  expect(response.status).toBe(401);
 });
 it('cascades diagnostic records with the owning job',async()=>{
  const {request,job}=await prepared();await appendActionLogs(f.db,f.agentCredential,request,f.clock);
  await f.db.deleteFrom('maintenance_jobs').where('id','=',job.id).execute();
  expect(await f.db.selectFrom('maintenance_logs').selectAll().execute()).toEqual([]);
 });
});
