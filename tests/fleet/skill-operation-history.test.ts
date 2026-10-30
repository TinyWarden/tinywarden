import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {newCredential} from '../../server/validation';
import {lifecycleFixture,resetTestSchema,url} from '../p4a.fixture';
import {actionFixture,readyActionFixture,type AwaitedLifecycle} from './skill-actions.fixture';
import {createMaintenanceOperation} from '../../server/maintenance/operations';
import {activityOptions,operationActivity} from '../../server/fleet/activity';
import {detailHost} from '../../server/fleet/inventory';
import {validOperationSummary} from '../../lib/maintenance/operation-summary';

describe.skipIf(!url)('saved skill operations on reserved PostgreSQL',()=>{
 let f:AwaitedLifecycle,source:Awaited<ReturnType<typeof actionFixture>>;
 beforeEach(async()=>{await resetTestSchema();f=await lifecycleFixture();source=await actionFixture(f);});
 afterEach(async()=>{await f?.db.destroy();});
 it('retains latest results and paginates exact server/installation records without changing saved work',async()=>{
  const {input}=await readyActionFixture(f,source),created=await createMaintenanceOperation(f.db,f.session,input,f.clock);
  await f.db.updateTable('maintenance_jobs').set({phase:'cancelled',completed_at:f.clock()}).where('operation_id','=',created.id).execute();
  const job=await f.db.selectFrom('maintenance_jobs').selectAll().where('operation_id','=',created.id).executeTakeFirstOrThrow();
  const operation=await f.db.selectFrom('fleet_operations').selectAll().where('id','=',created.id).executeTakeFirstOrThrow();
  const operationItem=await f.db.selectFrom('fleet_operation_items').selectAll().where('operation_id','=',created.id).executeTakeFirstOrThrow();
  const start=+f.clock();let last=created.id;
  for(let n=1;n<=26;n++){
   const id=randomUUID(),at=new Date(start+n);last=id;
   await f.db.insertInto('fleet_operations').values({...operation,id,created_at:at}).execute();
   await f.db.insertInto('fleet_operation_items').values({...operationItem,operation_id:id}).execute();
   await f.db.insertInto('maintenance_jobs').values({...job,id:randomUUID(),operation_id:id,created_at:at,updated_at:at,completed_at:at}).execute();
  }
  await f.advance(new Date(start+100));
  const before=await f.db.selectFrom('maintenance_jobs').selectAll().orderBy('id').execute();
  const query=`?host=${f.hostId}&installation=${source.installation}`;
  const first=await operationActivity(f.db,f.session,activityOptions(query,'operations'),f.clock);
  expect(first.total).toBe(27);expect(first.operations).toHaveLength(25);expect(first.operations[0]!.id).toBe(last);
  expect(first.operations.every(o=>'job'in o&&validOperationSummary(o.job)&&o.job.host_id===f.hostId&&o.job.installation_id===source.installation)).toBe(true);
  const next=await operationActivity(f.db,f.session,activityOptions(query+'&cursor='+first.next_cursor,'operations'),f.clock);
  expect(next.operations).toHaveLength(2);expect(new Set([...first.operations,...next.operations].map(o=>o.id)).size).toBe(27);
  for(const scoped of [`?host=${randomUUID()}&installation=${source.installation}`,`?host=${f.hostId}&installation=${randomUUID()}`]){
   expect((await operationActivity(f.db,f.session,activityOptions(scoped,'operations'),f.clock)).operations).toEqual([]);
   expect(()=>activityOptions(scoped+'&cursor='+first.next_cursor,'operations')).toThrow();
  }
  expect((await operationActivity(f.db,f.session,activityOptions(query+'&pending=1','operations'),f.clock)).operations).toEqual([]);
  const detail=await detailHost(f.db,f.session,f.hostId,f.clock),latest=detail.action_target?.latest_operations;
  expect(latest).toEqual([expect.objectContaining({operation_id:last,phase:'cancelled',installation_id:source.installation})]);
  expect(JSON.stringify(latest)).not.toMatch(/grant_id|permission_revision|input_json|settings_json|stdout|secret_digest/);
  expect(await f.db.selectFrom('maintenance_jobs').selectAll().orderBy('id').execute()).toEqual(before);
 });
 it('requires an Admin and validates the complete filter pair and cursor scope',async()=>{
  const query=`?host=${f.hostId}&installation=${source.installation}`;
  for(const invalid of [`?host=${f.hostId}`,`?installation=${source.installation}`,query+'&host='+f.hostId,query+'&unknown=1','?host=wrong&installation=wrong'])expect(()=>activityOptions(invalid,'operations')).toThrow();
  expect(()=>activityOptions(query,'setups')).toThrow();
  await expect(operationActivity(f.db,'',activityOptions(query,'operations'),f.clock)).rejects.toMatchObject({status:401});
  const id=randomUUID(),session=newCredential('session');
  await f.db.insertInto('operators').values({id,login:'history-reader',role:'user',recovery_admin:false,disabled_at:null,auth_version:1,created_at:f.clock()}).execute();
  await f.db.insertInto('operator_sessions').values({id:session.id,operator_id:id,secret_digest:session.digest,auth_version:1,issued_at:f.clock(),last_seen_at:f.clock(),expires_at:new Date(+f.clock()+3600000)}).execute();
  await expect(operationActivity(f.db,session.value,activityOptions(query,'operations'),f.clock)).rejects.toMatchObject({status:403});
 });
});
