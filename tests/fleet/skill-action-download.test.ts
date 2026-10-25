import {afterEach,beforeEach,describe,it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {lifecycleFixture,resetTestSchema,url} from '../p4a.fixture';
import {actionFixture,readyActionFixture,type AwaitedLifecycle} from './skill-actions.fixture';
import {createMaintenanceOperation} from '../../server/maintenance/operations';
import {downloadActionPackage} from '../../server/maintenance/package-download';

describe.skipIf(!url)('action artifact authority and integrity',()=>{
 let f:AwaitedLifecycle,store:string,source:Awaited<ReturnType<typeof actionFixture>>,job:string;
 const bytes=Buffer.from('opaque archive transfer fixture'),sha=createHash('sha256').update(bytes).digest('hex');
 beforeEach(async()=>{
  await resetTestSchema();f=await lifecycleFixture();source=await actionFixture(f);store=await mkdtemp(path.join(os.tmpdir(),'tw-action-download-'));
  source.metadata.archive={sha256:sha,size:bytes.length};
  await f.db.updateTable('skill_packages').set({metadata:source.metadata}).where('content_sha256','=',source.metadata.content_sha256).execute();
  const origin=await f.db.selectFrom('skill_package_origins').selectAll().where('content_sha256','=',source.metadata.content_sha256).executeTakeFirstOrThrow();
  await f.db.updateTable('skill_package_origins').set({origin:{...origin.origin,archive_sha256:sha,archive_size:bytes.length}}).where('id','=',origin.id).execute();
  const {input}=await readyActionFixture(f,source),operation=await createMaintenanceOperation(f.db,f.session,input,f.clock);
  job=(await f.db.selectFrom('maintenance_jobs').select('id').where('operation_id','=',operation.id).executeTakeFirstOrThrow()).id;
  await mkdir(path.join(store,'.archives'));await writeFile(path.join(store,'.archives',source.metadata.content_sha256+'.zip'),bytes);
 });
 afterEach(async()=>{await f?.db.destroy();if(store)await rm(store,{recursive:true,force:true});});
 it('serves exact pinned bytes without renewing monitoring contact, then fences changed authority',async()=>{
  const before=await f.db.selectFrom('agent_credentials').select(['last_contact_at','accepted_at']).where('agent_id','=',f.agentId).execute();
  const response=await downloadActionPackage(f.db,f.agentCredential,job,f.clock,store);
  expect(response.headers.get('X-TinyWarden-Archive-SHA256')).toBe(sha);
  expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  expect(await f.db.selectFrom('agent_credentials').select(['last_contact_at','accepted_at']).where('agent_id','=',f.agentId).execute()).toEqual(before);
  await f.db.updateTable('skill_action_grants').set({enabled:false,revision:'2'}).where('installation_id','=',source.installation).execute();
  await expect(downloadActionPackage(f.db,f.agentCredential,job,f.clock,store)).rejects.toMatchObject({code:'maintenance_authority_revoked'});
 });
 it('refuses corrupt or linked artifacts and an agent generation mismatch',async()=>{
  const file=path.join(store,'.archives',source.metadata.content_sha256+'.zip');
  await writeFile(file,Buffer.alloc(bytes.length,120));
  await expect(downloadActionPackage(f.db,f.agentCredential,job,f.clock,store)).rejects.toMatchObject({code:'temporarily_unavailable'});
  await rm(file);await writeFile(path.join(store,'other.zip'),bytes);await symlink(path.join(store,'other.zip'),file);
  await expect(downloadActionPackage(f.db,f.agentCredential,job,f.clock,store)).rejects.toBeTruthy();
  await f.db.updateTable('maintenance_jobs').set({generation:'2'}).where('id','=',job).execute();
  await expect(downloadActionPackage(f.db,f.agentCredential,job,f.clock,store)).rejects.toMatchObject({code:'maintenance_job_unknown'});
 });
});
