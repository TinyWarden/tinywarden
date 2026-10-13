import {randomUUID} from "node:crypto";
import {promises as fs} from "node:fs";
import path from "node:path";
import {beforeAll,afterAll,describe,it,expect} from "vitest";
import {sql} from "kysely";
import {Migrator,FileMigrationProvider} from "kysely/migration";
import {createDb} from "../server/db/client";
import {migrate} from "../server/db/migrate";
import {assertDatabaseTarget} from "../server/db/target";
import {hashPassword} from "../server/access/password";
import {initOperator,login,resetPassword,advanceAccess} from "../server/access/operator";
import {authorize,sessionStatus,sessionCookie} from "../server/access/session";
import {accessGate,requireHostAccess,localAdministrator} from "../server/access/scope";
import {mutateAccess,readChoices} from "../server/access/administration";
import {snapshotRead} from "../server/db/snapshot-read";
import {newCredential,parseCredential} from "../server/validation";
import {listHosts,detailHost} from "../server/fleet/inventory";
import {readDashboard} from "../server/fleet/dashboard";
import {readDashboardLayout} from "../server/fleet/dashboard-layout";
import {readHistory} from "../server/history/reads";
import {operatorAccess,operatorAccessChoices,operatorPassword} from "../server/http/access-handlers";
import {operatorSession,operatorIssueToken,operatorDiskDefinition,operatorHostDiskPolicy,operatorRevokeAgent} from "../server/http/handlers";
import {operatorBaselineDefinition,operatorBaselinePolicy} from "../server/http/baseline-handlers";
import {operatorPackageSkills,operatorPackageDefaults,operatorPackageVersions,operatorPackagePolicy,operatorPackageUpload,operatorPackageResults} from "../server/http/package-handlers";
import {operatorAgentUpdates} from "../server/http/agent-update-handlers";
import {operatorManualRun} from "../server/http/manual-handlers";
import {readDiskHealth} from "../server/skills/results/disk-health";
import {readBaselineHealth} from "../server/skills/results/baseline-health";
import {readHostMaintenance} from "../server/agent-updates/status";
import type {HttpContext} from "../server/http/response";
import {defaultDashboardLayout} from "../lib/skills/dashboard-types";
const url=process.env.TW_TEST_DATABASE_URL;
if(url&&new URL(url).pathname!=='/tinywarden_test_p1b')throw new Error('reserved_database_required');
describe.skipIf(!url)('account and server access',()=>{
 const db=createDb(url!),now=new Date(),clock=()=>new Date(now),origin='https://access.example.test',ctx:HttpContext={db,clock,config:{origin,databaseUrl:url!,heartbeatIntervalSeconds:60,staleAfterSeconds:180}};
 const adminId=randomUUID(),a=randomUUID(),b=randomUUID(),empty=randomUUID(),group=randomUUID(),secondGroup=randomUUID(),hosts=[randomUUID(),randomUUID()];let admin=newCredential('session');
 const oldPassword='synthetic-access-initial-42',newPassword='synthetic-access-replacement-43';let aSession='',bSession='',emptySession='';
 const revision=async()=>String((await db.selectFrom('access_control_state').select('revision').executeTakeFirstOrThrow()).revision);
 const req=(cookie:string,body?:unknown)=>new Request(origin+'/api/v1/operator/test',{headers:{Cookie:sessionCookie+'='+cookie,...(body!==undefined?{Origin:origin,'Content-Type':'application/json','X-TinyWarden-Request':'1'}:{})},...(body!==undefined?{method:'POST',body:JSON.stringify(body)}:{})});
 const edit=async(entity:'users'|'groups',id:string,values:Record<string,unknown>,action:'create'|'save'|'delete'|'password'='save')=>mutateAccess(db,admin.value,entity,id,action,{expected_revision:await revision(),...values},clock);
 const userEdit=(values:Record<string,unknown>={})=>({role:'user',disabled:false,add_hosts:[],remove_hosts:[],add_groups:[],remove_groups:[],...values});
 async function session(id:string){const op=await db.selectFrom('operators').select('auth_version').where('id','=',id).executeTakeFirstOrThrow(),s=newCredential('session');await db.insertInto('operator_sessions').values({id:s.id,operator_id:id,secret_digest:s.digest,auth_version:op.auth_version,issued_at:now,last_seen_at:now,expires_at:new Date(now.getTime()+3600000)}).execute();return s.value;}
 beforeAll(async()=>{
  await assertDatabaseTarget(db,'tinywarden_test_p1b',false);await sql`DROP SCHEMA IF EXISTS tinywarden CASCADE`.execute(db);await sql`CREATE SCHEMA tinywarden AUTHORIZATION tinywarden`.execute(db);
  const legacy=new Migrator({db,migrationTableSchema:'tinywarden',provider:new FileMigrationProvider({fs,path,migrationFolder:path.resolve('server/db/migrations')})});const result=await legacy.migrateTo('023_agent_updates');if(result.error)throw result.error;
  const hashed=await hashPassword(oldPassword);
  await sql`INSERT INTO tinywarden.operators(id,singleton,login,password_algorithm,password_n,password_r,password_p,password_salt,password_hash,auth_version,created_at,password_changed_at)
   VALUES(${adminId}::uuid,true,'admin','scrypt-v1',131072,8,1,${hashed.salt},${hashed.hash},1,${now},${now})`.execute(db);
  await db.insertInto('operator_sessions').values({id:admin.id,operator_id:adminId,secret_digest:admin.digest,auth_version:1,issued_at:now,last_seen_at:now,expires_at:new Date(now.getTime()+3600000)}).execute();
  await db.insertInto('operator_dashboard_layouts').values({operator_id:adminId,layout:defaultDashboardLayout(),revision:1,updated_at:now,last_request_id:randomUUID(),last_fingerprint:Buffer.alloc(32,2)}).execute();
  await migrate(url!,'tinywarden_test_p1b');
  for(const id of hosts){await db.insertInto('hosts').values({id,label:id===hosts[0]?'Alpha':'Beta',reported_hostname:'test.example',os_id:'debian',os_version:'13',architecture:'amd64',enrolled_agent_version:'0.0.10',created_at:now}).execute();await db.insertInto('agents').values({id:randomUUID(),host_id:id,current_generation:1,enrolled_at:now,revoked_at:null,heartbeat_interval_seconds:60,stale_after_seconds:180}).execute();}
  const epoch=randomUUID();await db.insertInto('history_control').values({singleton:true,epoch,activated_at:now,scan_after:null,scan_started_at:now,scan_completed_at:now,last_invocation_at:now}).execute();
  for(const host of hosts){const cursor=randomUUID();await db.insertInto('history_subjects').values({id:cursor,host_id:host,subject_key:'contact',epoch,agent_id:null,generation:null,source_revision:0,policy_version:0,assessment_version:null,state:'unknown',reason:'no_contact',first_seen_at:now,continuous_since:now,last_sample_at:now,measured_at:null,facts:{},suspended:false,transition_number:1}).execute();await db.insertInto('history_events').values({id:randomUUID(),cursor_id:cursor,transition_number:1,epoch,host_id:host,subject_key:'contact',agent_id:null,generation:null,source_revision:0,policy_version:0,assessment_version:null,kind:'state',from_state:null,to_state:'unknown',from_reason:null,to_reason:'no_contact',previous_sample_at:null,observed_at:now,measured_at:null,after_gap:false,previous_scope:null,before_facts:null,after_facts:{}}).execute();}
 },30000);
 afterAll(()=>db.destroy());
 it('preserves existing identity, exact credential, session and dashboard',async()=>{
  expect(await sessionStatus(db,admin.value,clock)).toMatchObject({login:'admin',role:'admin',password_change_required:false,access:{account_id:adminId}});
  const credential=await db.selectFrom('operator_local_credentials').selectAll().where('operator_id','=',adminId).executeTakeFirstOrThrow();expect(credential.must_change_password).toBe(false);
  expect(await login(db,' ADMIN ',oldPassword,clock)).toMatch(/^tw_/);expect((await readDashboardLayout(db,admin.value,clock)).revision).toBe('1');
  await expect(initOperator(db,oldPassword,clock)).rejects.toMatchObject({status:409});
 });
 it('creates required-password accounts; keeps sessions restricted until changed',async()=>{
  for(const [id,label] of [[a,'viewer.a'],[b,'viewer.b'],[empty,'viewer.none']] as const)await edit('users',id,{login:label,role:'user',password:oldPassword},'create');
  const first=await login(db,'VIEWER.A',oldPassword,clock);expect((await sessionStatus(db,first,clock)).password_change_required).toBe(true);
  await expect(listHosts(db,first,{limit:25},clock)).rejects.toMatchObject({code:'password_change_required',status:403});
  const r=await operatorPassword(req(first,{schema_version:1,current_password:oldPassword,new_password:newPassword}),ctx);expect(r.status).toBe(204);
  await expect(sessionStatus(db,first,clock)).rejects.toMatchObject({status:401});aSession=await login(db,'viewer.a',newPassword,clock);
  await db.updateTable('operator_local_credentials').set({must_change_password:false}).where('operator_id','in',[b,empty]).execute();bSession=await session(b);emptySession=await session(empty);
 });
 it('scopes lists, dashboard counts, catalog choices and host reads before paging',async()=>{
  await edit('users',a,userEdit({add_hosts:[hosts[0]]}));await edit('users',b,userEdit({add_hosts:[hosts[1]]}));
  expect((await listHosts(db,aSession,{limit:1},clock)).hosts.map(h=>h.host_id)).toEqual([hosts[0]]);
  expect((await readDashboard(db,aSession,{},clock)).counts.total).toBe(1);expect((await readDashboard(db,bSession,{},clock)).counts.total).toBe(1);
  expect((await readDashboard(db,emptySession,{},clock)).counts.total).toBe(0);expect((await readDashboardLayout(db,emptySession,clock)).catalog.skills).toEqual([]);
  expect((await detailHost(db,aSession,hosts[0]!,clock)).host.host_id).toBe(hosts[0]);await expect(detailHost(db,aSession,hosts[1]!,clock)).rejects.toMatchObject({status:404});
  await expect(readDiskHealth(db,aSession,hosts[1]!,clock)).rejects.toMatchObject({status:404});await expect(readBaselineHealth(db,aSession,hosts[1]!,clock)).rejects.toMatchObject({status:404});await expect(readHostMaintenance(db,aSession,hosts[1]!,clock)).rejects.toMatchObject({status:404});
  expect((await operatorPackageResults(req(aSession),hosts[1]!,ctx)).status).toBe(404);
  const history=await readHistory(db,aSession,{limit:25},clock);expect(history.events.map(e=>e.host_id)).toEqual([hosts[0]]);expect(history.filters.servers.map(h=>h.id)).toEqual([hosts[0]]);expect((await readHistory(db,emptySession,{limit:25},clock)).filters.servers).toEqual([]);expect((await readDashboard(db,aSession,{},clock)).history!.events.map(e=>e.host_id)).toEqual([hosts[0]]);
  await expect(readHistory(db,aSession,{limit:25,hosts:hosts},clock)).rejects.toMatchObject({status:404});
 });
 it('denies global and per-host management, uploads and Run now to users',async()=>{
  const id=randomUUID(),r=()=>req(aSession),post=()=>req(aSession,{schema_version:1,request_id:randomUUID(),expected_context:'a'.repeat(64)});
  const checks=[()=>operatorAccess(r(),'users',undefined,'save',ctx),()=>operatorAccessChoices(r(),'users',a,'hosts',ctx),()=>operatorDiskDefinition(r(),ctx),()=>operatorHostDiskPolicy(r(),hosts[0]!,ctx),()=>operatorBaselineDefinition(r(),"package-updates",ctx),()=>operatorBaselinePolicy(r(),hosts[0]!,'package-updates',ctx),()=>operatorPackageSkills(r(),ctx),()=>operatorPackageDefaults(r(),id,ctx),()=>operatorPackageVersions(r(),id,ctx),()=>operatorPackagePolicy(r(),hosts[0]!,id,ctx),()=>operatorAgentUpdates(r(),undefined,ctx),()=>operatorManualRun(post(),hosts[0]!,id,ctx),()=>operatorPackageUpload(new Request(origin+'/api/v2/operator/skills/upload',{method:'POST',headers:{Cookie:sessionCookie+'='+aSession,Origin:origin,'X-TinyWarden-Request':'1','X-TinyWarden-Upload-ID':id,'Content-Type':'application/zip'},body:Buffer.from('bad')}),ctx)];
  for(const check of checks)expect((await check()).status,check.toString()).toBe(403);
  expect((await operatorIssueToken(req(aSession,{schema_version:1,request_id:id,label:"Synthetic",target_agent_id:null}),ctx)).status).toBe(403);
  expect((await operatorRevokeAgent(req(aSession,{schema_version:1}),id,ctx)).status).toBe(403);
 });
 it('keeps union grants and sessions while direct, membership and group grants change',async()=>{
  await edit('groups',group,{name:'Operations'},'create');await edit('groups',secondGroup,{name:'Storage'},'create');
  for(const id of [group,secondGroup])await edit('groups',id,{name:id===group?'Operations':'Storage',add_hosts:[hosts[0]],remove_hosts:[],add_members:[a],remove_members:[]});
  await edit('users',a,userEdit({remove_hosts:[hosts[0]]}));expect((await listHosts(db,aSession,{limit:25},clock)).hosts).toHaveLength(1);
  const choices=await readChoices(db,admin.value,'users',a,'hosts',{page:1,search:''},clock);expect(choices.items.find(r=>r.id===hosts[0])).toMatchObject({selected:false,inherited:['Operations','Storage']});
  await edit('groups',group,{},'delete');expect((await listHosts(db,aSession,{limit:25},clock)).hosts).toHaveLength(1);
  await edit('users',a,userEdit({remove_groups:[secondGroup]}));expect((await listHosts(db,aSession,{limit:25},clock)).hosts).toHaveLength(0);expect((await sessionStatus(db,aSession,clock)).role).toBe('user');
 });
 it('uses optimistic edits, guards the last active admin and self, and revokes credentials on disable/reset/role',async()=>{
  const rev=await revision();await edit('groups',secondGroup,{name:'Storage',add_hosts:[],remove_hosts:[],add_members:[],remove_members:[]});await expect(mutateAccess(db,admin.value,'users',b,'save',{expected_revision:rev,...userEdit()},clock)).rejects.toMatchObject({status:409});
  await expect(edit('users',adminId,userEdit())).rejects.toMatchObject({code:'last_admin'});
  await edit('users',b,userEdit({disabled:true}));await expect(sessionStatus(db,bSession,clock)).rejects.toMatchObject({status:401});await expect(login(db,'viewer.b',oldPassword,clock)).rejects.toMatchObject({status:401});
  await edit('users',b,userEdit());bSession=await session(b);await edit('users',b,{password:newPassword},'password');await expect(sessionStatus(db,bSession,clock)).rejects.toMatchObject({status:401});expect((await db.selectFrom('operator_local_credentials').select('must_change_password').where('operator_id','=',b).executeTakeFirstOrThrow()).must_change_password).toBe(true);
  await edit('users',empty,userEdit({role:'admin'}));await expect(sessionStatus(db,emptySession,clock)).rejects.toMatchObject({status:401});
  const audit=await db.selectFrom('audit_events').select('access_change').where('action','=','access.changed').execute();expect(JSON.stringify(audit)).not.toContain(oldPassword);expect(JSON.stringify(audit)).not.toContain(newPassword);
 });
 it('takes a fresh snapshot after waiting behind a committed revocation',async()=>{
  await edit('users',a,userEdit({add_hosts:[hosts[0]]}));let acquired!:()=>void,release!:()=>void,readerSnapshot!:()=>void,startRead!:()=>void;const locked=new Promise<void>(r=>acquired=r),unlock=new Promise<void>(r=>release=r),snapshot=new Promise<void>(r=>readerSnapshot=r),readGo=new Promise<void>(r=>startRead=r);
  const writer=db.transaction().execute(async trx=>{await accessGate(trx,true);acquired();await unlock;await trx.deleteFrom('access_user_hosts').where('operator_id','=',a).execute();await advanceAccess(trx);});await locked;let attempts=0;
  const reader=snapshotRead(db,async trx=>{attempts++;await sql`SELECT count(*) FROM tinywarden.access_user_hosts`.execute(trx);if(attempts===1){readerSnapshot();await readGo;}const actor=await authorize(trx,aSession,clock);await requireHostAccess(trx,actor,hosts[0]!);});const outcome=reader.catch(e=>e);await snapshot;startRead();release();await writer;expect(await outcome).toMatchObject({status:404});expect(attempts).toBeGreaterThan(1);
 });
 it('stamps concurrent HTTP reads with their own account and current revision',async()=>{
  const responses=await Promise.all([operatorSession(req(admin.value),ctx),operatorSession(req(aSession),ctx)]);const bodies=await Promise.all(responses.map(r=>r.json()));expect(bodies[0].access.account_id).toBe(adminId);expect(bodies[1].access.account_id).toBe(a);expect(bodies[0].access.revision).toBe(await revision());
 });
 it('paginates searchable selections without losing assignments and limits deltas',async()=>{
  await db.transaction().execute(async trx=>{await accessGate(trx,true);await trx.insertInto('access_groups').values(Array.from({length:51},(_,i)=>({id:randomUUID(),name:'Paged '+String(i).padStart(2,'0'),created_at:now}))).execute();await advanceAccess(trx);});
  const first=await readChoices(db,admin.value,'users',a,'groups',{page:1,search:'Paged'},clock),last=await readChoices(db,admin.value,'users',a,'groups',{page:2,search:'Paged'},clock);expect(first.items).toHaveLength(50);expect(last.items).toHaveLength(1);expect(first.total).toBe(51);
  await edit('users',a,userEdit({add_groups:[first.items[0]!.id,last.items[0]!.id]}));expect((await readChoices(db,admin.value,'users',a,'groups',{page:2,search:'Paged'},clock)).items[0]!.selected).toBe(true);
  await expect(edit('users',a,userEdit({add_hosts:Array.from({length:257},()=>randomUUID())}))).rejects.toMatchObject({status:400});
  const r=await operatorAccess(req(admin.value),'users',undefined,'save',ctx);expect(r.status).toBe(200);expect(JSON.stringify(await r.json())).not.toContain('password_hash');
 });
 it('rejects credentialless and unknown local logins and caps username bucket storage',async()=>{
  const id=randomUUID();await db.insertInto('operators').values({id,login:'external.only',role:'user',disabled_at:null,recovery_admin:false,auth_version:1,created_at:now}).execute();
  for(const name of ['external.only','unknown.account'])await expect(login(db,name,oldPassword,clock)).rejects.toMatchObject({code:'unauthorized',status:401});
  expect(Number((await sql<{n:string}>`SELECT count(*)::text n FROM tinywarden.login_throttle_buckets`.execute(db)).rows[0]!.n)).toBeLessThanOrEqual(1024);
  for(let i=0;i<5;i++)await expect(login(db,'throttle.unknown',oldPassword,clock)).rejects.toMatchObject({status:401});await expect(login(db,'throttle.unknown',oldPassword,clock)).rejects.toMatchObject({status:429});
 });
 it('lets another admin disable or demote the initial account and keeps the last admin',async()=>{
  for(const op of await db.selectFrom('operators').select('id').where('role','=','admin').where('id','!=',adminId).execute())await edit('users',op.id,userEdit());
  await expect(edit('users',adminId,userEdit())).rejects.toMatchObject({code:'last_admin'});
  await expect(edit('users',adminId,userEdit({role:'admin',disabled:true}))).rejects.toMatchObject({code:'last_admin'});
  const peer=randomUUID();await edit('users',peer,{login:'other.admin',role:'admin',password:oldPassword},'create');
  await db.updateTable('operator_local_credentials').set({must_change_password:false}).where('operator_id','=',peer).execute();const cookie=await session(peer);
  const byPeer=async(values:Record<string,unknown>)=>mutateAccess(db,cookie,'users',adminId,'save',{expected_revision:await revision(),...userEdit(values)},clock);
  const old=admin.value;await byPeer({role:'admin',disabled:true});await expect(sessionStatus(db,old,clock)).rejects.toMatchObject({status:401});await expect(login(db,'admin',oldPassword,clock)).rejects.toMatchObject({status:401});
  expect((await db.transaction().execute(localAdministrator)).id).toBe(peer);
  await byPeer({role:'admin'});await expect(sessionStatus(db,old,clock)).rejects.toMatchObject({status:401});admin=parseCredential('session',await session(adminId));
  const beforeDemotion=admin.value;await byPeer({role:'user'});await expect(sessionStatus(db,beforeDemotion,clock)).rejects.toMatchObject({status:401});expect((await sessionStatus(db,await session(adminId),clock)).role).toBe('user');
  await expect(mutateAccess(db,cookie,'users',peer,'save',{expected_revision:await revision(),...userEdit()},clock)).rejects.toMatchObject({code:'last_admin'});
  await byPeer({role:'admin'});admin=parseCredential('session',await session(adminId));
  await expect(mutateAccess(db,cookie,'users',peer,'save',{expected_revision:await revision(),...userEdit()},clock)).rejects.toMatchObject({code:'self_access_change'});
  await edit('users',peer,userEdit({disabled:true}));expect((await db.transaction().execute(localAdministrator)).id).toBe(adminId);
 });
 it('serializes two admins attempting to demote each other',async()=>{
  const peer=randomUUID();await edit('users',peer,{login:'racing.admin',role:'admin',password:oldPassword},'create');
  await db.updateTable('operator_local_credentials').set({must_change_password:false}).where('operator_id','=',peer).execute();const cookie=await session(peer),rev=await revision(),original=admin.value;
  const outcomes=await Promise.allSettled([mutateAccess(db,original,'users',peer,'save',{expected_revision:rev,...userEdit()},clock),mutateAccess(db,cookie,'users',adminId,'save',{expected_revision:rev,...userEdit()},clock)]);
  expect(outcomes.filter(v=>v.status==='fulfilled')).toHaveLength(1);expect(outcomes.filter(v=>v.status==='rejected')).toHaveLength(1);
  const active=await db.selectFrom('operators').select('id').where('role','=','admin').where('disabled_at','is',null).execute();expect(active).toHaveLength(1);
  if(active[0]!.id===peer){await expect(sessionStatus(db,original,clock)).rejects.toMatchObject({status:401});await mutateAccess(db,cookie,'users',adminId,'save',{expected_revision:await revision(),...userEdit({role:'admin'})},clock);admin=parseCredential('session',await session(adminId));}
  else await expect(sessionStatus(db,cookie,clock)).rejects.toMatchObject({status:401});
  await edit('users',peer,userEdit({disabled:true}));
 });
 it('CLI resets the original account password explicitly',async()=>{
  await resetPassword(db,newPassword,clock);await expect(sessionStatus(db,admin.value,clock)).rejects.toMatchObject({status:401});expect((await sessionStatus(db,await login(db,'admin',newPassword,clock),clock)).role).toBe('admin');
 });
 it('migrates an empty installation and creates only the initial local admin',async()=>{
  await sql`DROP SCHEMA tinywarden CASCADE`.execute(db);await sql`CREATE SCHEMA tinywarden AUTHORIZATION tinywarden`.execute(db);await migrate(url!,'tinywarden_test_p1b');await initOperator(db,oldPassword,clock);expect(await db.selectFrom('operators').select(['login','role','recovery_admin','disabled_at']).execute()).toEqual([{login:'admin',role:'admin',recovery_admin:true,disabled_at:null}]);
  expect((await sessionStatus(db,await login(db,'admin',oldPassword,clock),clock)).password_change_required).toBe(false);
 });
});
