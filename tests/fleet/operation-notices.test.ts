import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {newCredential} from '../../server/validation';
import {lifecycleFixture,resetTestSchema,url} from '../p4a.fixture';
import {actionFixture,readyActionFixture,type AwaitedLifecycle} from './skill-actions.fixture';
import {createMaintenanceOperation} from '../../server/maintenance/operations';
import {dismissOperationNotice} from '../../server/fleet/operation-notices';
import {operatorDismissOperationNotice} from '../../server/http/operation-notice-handlers';
import {detailHost} from '../../server/fleet/inventory';
import {activityOptions,operationActivity} from '../../server/fleet/activity';
import {assertPurgeCoverage} from '../../server/fleet/purge';

const path='/api/v1/operator/operation-notices/dismiss';
describe.skipIf(!url)('account-wide operation notices on reserved PostgreSQL',()=>{
 let f:AwaitedLifecycle,source:Awaited<ReturnType<typeof actionFixture>>;
 beforeEach(async()=>{await resetTestSchema();f=await lifecycleFixture();source=await actionFixture(f);});
 afterEach(async()=>{await f?.db.destroy();});
 async function job(){const {input}=await readyActionFixture(f,source),operation=await createMaintenanceOperation(f.db,f.session,input,f.clock);
  await f.db.updateTable('maintenance_jobs').set({phase:'cancelled',completed_at:f.clock()}).where('operation_id','=',operation.id).execute();
  return f.db.selectFrom('maintenance_jobs').selectAll().where('operation_id','=',operation.id).executeTakeFirstOrThrow();}
 async function session(role:'admin'|'user',existing?:string){const id=existing??randomUUID(),credential=newCredential('session');
  if(!existing)await f.db.insertInto('operators').values({id,login:'notice-'+id,role,recovery_admin:false,disabled_at:null,auth_version:1,created_at:f.clock()}).execute();
  await f.db.insertInto('operator_sessions').values({id:credential.id,operator_id:id,secret_digest:credential.digest,auth_version:1,issued_at:f.clock(),last_seen_at:f.clock(),expires_at:new Date(+f.clock()+3600000)}).execute();
  return credential.value;}
 it('persists for the account across sessions, isolates other accounts, retains history and follows changed/expired results',async()=>{
  const saved=await job(),input={job_id:saved.id,expected_updated_at:saved.updated_at.toISOString()};
  const before=await f.db.selectFrom('maintenance_jobs').selectAll().execute();
  const dismissed=await dismissOperationNotice(f.db,f.session,input,f.clock);
  await dismissOperationNotice(f.db,f.session,input,f.clock);
  expect(await f.db.selectFrom('operation_notice_dismissals').selectAll().execute()).toHaveLength(1);
  expect(await f.db.selectFrom('maintenance_jobs').selectAll().execute()).toEqual(before);
  const own=await detailHost(f.db,await session('admin',dismissed.access.account_id),f.hostId,f.clock);
  expect(own.action_target?.latest_operations?.[0]?.notice_dismissed).toBe(true);
  const other=await detailHost(f.db,await session('admin'),f.hostId,f.clock);
  expect(other.action_target?.latest_operations?.[0]?.notice_dismissed).toBe(false);
  expect((await operationActivity(f.db,f.session,activityOptions(`?host=${f.hostId}&installation=${source.installation}`,'operations'),f.clock)).operations).toHaveLength(1);
  await f.db.updateTable('maintenance_jobs').set({updated_at:new Date(+saved.updated_at+1)}).where('id','=',saved.id).execute();
  expect((await detailHost(f.db,f.session,f.hostId,f.clock)).action_target?.latest_operations?.[0]?.notice_dismissed).toBe(false);
  await expect(dismissOperationNotice(f.db,f.session,input,f.clock)).rejects.toMatchObject({status:409});
  await f.db.transaction().execute(assertPurgeCoverage);
  await f.db.deleteFrom('maintenance_jobs').where('id','=',saved.id).execute();
  expect(await f.db.selectFrom('operation_notice_dismissals').selectAll().execute()).toEqual([]);
 });
 it('enforces Admin/Origin/body/version checks and refuses to hide active or uncertain work',async()=>{
  const saved=await job(),input={schema_version:1,job_id:saved.id,expected_updated_at:saved.updated_at.toISOString()};
  const post=(cookie:string,body:unknown=input)=>operatorDismissOperationNotice(f.req(path,body,undefined,cookie),f.ctx);
  expect((await post('')).status).toBe(401);expect((await post(await session('user'))).status).toBe(403);
  const cross=f.req(path,input,undefined,f.session);cross.headers.set('Origin','https://elsewhere.example');
  expect((await operatorDismissOperationNotice(cross,f.ctx)).status).toBe(403);
  expect((await post(f.session,{...input,operator_id:randomUUID()})).status).toBe(400);
  expect((await post(f.session,{...input,expected_updated_at:'invalid'})).status).toBe(400);
  expect((await post(f.session,{...input,job_id:randomUUID()})).status).toBe(404);
  expect((await post(f.session,{...input,expected_updated_at:new Date(+saved.updated_at+1).toISOString()})).status).toBe(409);
  for(const state of [{phase:'queued' as const,attention:false,completed_at:null},{phase:'awaiting_approval' as const,attention:false,completed_at:null},{phase:'cancelled' as const,attention:true,completed_at:saved.completed_at}]){
   await f.db.updateTable('maintenance_jobs').set(state).where('id','=',saved.id).execute();
   expect((await post(f.session)).status).toBe(409);
  }
  expect(await f.db.selectFrom('operation_notice_dismissals').selectAll().execute()).toEqual([]);
 });
});
