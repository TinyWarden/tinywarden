import {createHash,generateKeyPairSync,randomUUID,randomBytes,sign} from 'node:crypto';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {sql} from 'kysely';
import {createDb} from '../server/db/client';
import {migrate} from '../server/db/migrate';
import {initOperator,login} from '../server/access/operator';
import {parseCredential} from '../server/validation';
import {readProfile,saveProfile,unlinkIdentity} from '../server/access/profile';
import {readAccess,mutateAccess} from '../server/access/administration';
import {saveOidcSettings} from '../server/access/oidc-configuration';
import {beginOidc,finishOidc,claimGroups} from '../server/access/oidc';
import {sessionStatus,sessionCookie,issueSession} from '../server/access/session';
import {oidcStart,oidcCallback} from '../server/http/oidc-handlers';
import {oidcConfiguration} from '../server/access/oidc-client';
import type {HttpContext} from '../server/http/response';
const url=process.env.TW_TEST_DATABASE_URL;
if(url&&new URL(url).pathname!=='/tinywarden_test_p1b')throw new Error('reserved_database_required');
describe.skipIf(!url)('Profiles and OIDC',()=>{
 const db=createDb(url!),origin='https://app.example.test',issuer='https://auth.example.test/application/o/tinywarden/',secret=randomBytes(32).toString('base64url');
 let now=new Date(),admin='',adminId='',group='',secondGroup='';
 const clock=()=>new Date(now),revision=async()=>String((await db.selectFrom('access_control_state').select('revision').executeTakeFirstOrThrow()).revision);
 const key=generateKeyPairSync('rsa',{modulusLength:2048}),other=generateKeyPairSync('rsa',{modulusLength:2048}),jwks={keys:[{...key.publicKey.export({format:'jwk'}),kid:'test-rsa',alg:'RS256',use:'sig'}]};
 type Person={sub:string;name?:string;email?:string;preferred_username?:string;groups?:unknown;nonce?:string;iss?:string;aud?:string;exp?:number;wrongKey?:boolean;userinfoSub?:string;admin?:boolean};
 let person:Person={sub:'one',name:'Alice',email:'alice@example.test',groups:['storage']};
 const codes=new Map<string,{nonce:string;challenge:string;person:Person}>();let lastTokenBody='';
 const fetcher:typeof fetch=async(input,init)=>{
  const u=new URL(String(input));
  const json=(body:unknown)=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
  if(u.pathname.endsWith('/.well-known/openid-configuration'))return json({issuer,authorization_endpoint:new URL('/authorize',issuer).href,token_endpoint:new URL('/token',issuer).href,jwks_uri:new URL('/jwks',issuer).href,userinfo_endpoint:new URL('/userinfo',issuer).href,id_token_signing_alg_values_supported:['RS256'],token_endpoint_auth_methods_supported:['client_secret_post'],code_challenge_methods_supported:['S256'],response_types_supported:['code'],authorization_response_iss_parameter_supported:true});
  if(u.pathname==='/jwks')return json(jwks);
  if(u.pathname==='/userinfo')return json({sub:person.userinfoSub??person.sub,name:person.name,email:person.email,preferred_username:person.preferred_username,groups:person.groups});
  if(u.pathname==='/token'){
   const body=new URLSearchParams(String(init?.body));lastTokenBody=body.toString();const code=codes.get(body.get('code')??'');if(!code)throw new Error('bad_code');codes.delete(body.get('code')!);
   expect(body.get('client_secret')).toBe(secret);expect(body.get('redirect_uri')).toBe(origin+'/api/v1/operator/oidc/callback');
   expect(createHash('sha256').update(body.get('code_verifier')!).digest('base64url')).toBe(code.challenge);
   const p=code.person,seconds=Math.floor(Date.now()/1000),head=Buffer.from(JSON.stringify({alg:'RS256',kid:'test-rsa'})).toString('base64url');
   const claims=Buffer.from(JSON.stringify({iss:p.iss??issuer,aud:p.aud??'test-client',sub:p.sub,iat:seconds,exp:p.exp??seconds+600,nonce:p.nonce??code.nonce,admin:p.admin})).toString('base64url');
   const unsigned=head+'.'+claims,jwt=unsigned+'.'+sign('RSA-SHA256',Buffer.from(unsigned),p.wrongKey?other.privateKey:key.privateKey).toString('base64url');
   return json({access_token:'synthetic-access-token',token_type:'Bearer',expires_in:600,id_token:jwt});
  }
  throw new Error('unexpected_endpoint');
 };
 const flow=async(intent:'login'|'link'='login',cookie=admin)=>{
  await db.deleteFrom('login_throttle_buckets').execute();await db.deleteFrom('login_throttle').execute();
  const start=await beginOidc(db,origin,secret,intent,intent==='link'?cookie:undefined,clock,randomUUID(),fetcher),auth=new URL(start.url),code=randomUUID();codes.set(code,{nonce:auth.searchParams.get('nonce')!,challenge:auth.searchParams.get('code_challenge')!,person:{...person}});
  const callback=new URL(origin+'/api/v1/operator/oidc/callback');callback.search=new URLSearchParams({code,state:auth.searchParams.get('state')!,iss:issuer}).toString();return {start,auth,callback};
 };
 const finish=async(f:Awaited<ReturnType<typeof flow>>)=>finishOidc(db,f.callback,f.start.browser,origin,secret,clock,randomUUID(),fetcher);
 const settings=async(extra:Record<string,unknown>={})=>saveOidcSettings(db,admin,{expected_revision:await revision(),label:'authentik',issuer,client_id:'test-client',enabled:true,groups_claim:'groups',mappings:[{external_group:'storage',group_id:group}],...extra},clock,secret,randomUUID());
 const edit=async(id:string,extra:Record<string,unknown>={})=>mutateAccess(db,admin,'users',id,'save',{expected_revision:await revision(),role:'user',disabled:false,add_hosts:[],remove_hosts:[],add_groups:[],remove_groups:[],...extra},clock);
 beforeAll(async()=>{
  await sql`DROP SCHEMA IF EXISTS tinywarden CASCADE`.execute(db);await sql`CREATE SCHEMA tinywarden AUTHORIZATION tinywarden`.execute(db);await migrate(url!,'tinywarden_test_p1b');
  await initOperator(db,'synthetic-admin-password-2026',clock);admin=await login(db,'admin','synthetic-admin-password-2026',clock);adminId=(await sessionStatus(db,admin,clock)).access.account_id;
  group=randomUUID();secondGroup=randomUUID();await db.insertInto('access_groups').values([{id:group,name:'Storage',created_at:now},{id:secondGroup,name:'Manual',created_at:now}]).execute();
  await settings();
 },30000);
 afterAll(()=>db.destroy());
 it('saves a private profile without altering authority, preserves verification only for unchanged email, rejects stale edits',async()=>{
  const p=await readProfile(db,admin,clock);expect(p.email).toBeNull();expect(p.local_password).toBe(true);const access=await revision();
  await saveProfile(db,admin,{expected_revision:p.revision,display_name:'Admin Name',email:'admin@example.test'},clock,randomUUID());expect(await revision()).toBe(access);
  await expect(saveProfile(db,admin,{expected_revision:p.revision,display_name:'stale',email:null},clock,randomUUID())).rejects.toMatchObject({status:409});
  await db.updateTable('operator_profiles').set({email_verified_at:now}).where('operator_id','=',adminId).execute();let current=await readProfile(db,admin,clock);
  await saveProfile(db,admin,{expected_revision:current.revision,display_name:'Same email',email:current.email},clock,randomUUID());expect((await readProfile(db,admin,clock)).email_verified).toBe(true);
  current=await readProfile(db,admin,clock);await saveProfile(db,admin,{expected_revision:current.revision,display_name:'Changed email',email:'changed@example.test'},clock,randomUUID());expect((await readProfile(db,admin,clock)).email_verified).toBe(false);
 });
 it('uses real code, PKCE, nonce and signed token/JWKS validation; provisions only User with no local password',async()=>{
  person={sub:'one',name:'Alice',email:'changed@example.test',preferred_username:'admin',groups:['storage'],admin:true};const f=await flow();const result=await finish(f);expect(result.session).toBeTruthy();
  const s=await sessionStatus(db,result.session!,clock),p=await readProfile(db,result.session!,clock);expect(s.role).toBe('user');expect(s.local_password).toBe(false);expect(s.auth_method).toBe('oidc');expect(s.access.account_id).not.toBe(adminId);
  expect(p.display_name).toBe('Alice');expect(p.email_verified).toBe(false);expect(await db.selectFrom('access_user_hosts').selectAll().where('operator_id','=',p.id).execute()).toEqual([]);
  expect(p.provider_groups.map(g=>g.name)).toEqual(['Storage']);expect(p.identities).toHaveLength(1);expect(p.login).not.toBe('admin');expect(lastTokenBody).toContain('code_verifier=');
  await expect(finish(f)).rejects.toMatchObject({code:'oidc_failed'});
 });
 it('binds the ceremony to the browser and rejects expiry and callback replay',async()=>{
  person={sub:'one',groups:[]};let f=await flow();await expect(finishOidc(db,f.callback,'x'.repeat(43),origin,secret,clock,randomUUID(),fetcher)).rejects.toMatchObject({code:'oidc_failed'});await finish(f);
  f=await flow();now=new Date(now.getTime()+600001);await expect(finish(f)).rejects.toMatchObject({code:'oidc_failed'});now=new Date();
 });
 it('rejects bad signature, nonce, issuer, audience, expiration and UserInfo subject',async()=>{
  for(const change of [{wrongKey:true},{nonce:'wrong'},{iss:'https://other.example.test/'},{aud:'other-client'},{exp:1},{userinfoSub:'different-user'}]){
   person={sub:'one',groups:[],...change};const f=await flow();await expect(finish(f)).rejects.toThrow();expect(await db.selectFrom('oidc_transactions').select('id').where('state_digest','=',createHash('sha256').update(f.auth.searchParams.get('state')!).digest()).executeTakeFirst()).toBeUndefined();
  }
 });
 it('links only after authenticated recent local sign-in, preserves existing IDs/grants; refuses identity transfer',async()=>{
  person={sub:'admin-external',name:'Remote admin',email:'changed@example.test',groups:[]};const f=await flow('link');expect(f.auth.searchParams.get('prompt')).toBe('login');await finish(f);
  expect((await readProfile(db,admin,clock)).identities).toHaveLength(1);expect((await readProfile(db,admin,clock)).display_name).toBe('Changed email');
  person={sub:'one',groups:[]};await expect(finish(await flow('link'))).rejects.toMatchObject({code:'oidc_already_linked'});
  const parsed=parseCredential('session',admin);await db.updateTable('operator_sessions').set({issued_at:new Date(now.getTime()-16*60000)}).where('id','=',parsed.id).execute();
  await expect(flow('link')).rejects.toMatchObject({code:'oidc_recent_login_required'});await db.updateTable('operator_sessions').set({issued_at:now}).where('id','=',parsed.id).execute();
 });
 it('enforces the exclusive method for local Users, invalidates their sessions, and preserves Admin fallback',async()=>{
  const identity=await db.selectFrom('operator_external_identities').selectAll().where('subject','=','one').executeTakeFirstOrThrow(),id=identity.operator_id;
  await expect(mutateAccess(db,admin,'users',id,'password',{expected_revision:await revision(),password:'synthetic-user-password-2026'},clock)).rejects.toMatchObject({code:'local_login_disabled'});
  await mutateAccess(db,admin,'users',id,'password',{expected_revision:await revision(),password:'synthetic-user-password-2026',enable_local:true},clock);
  const name=(await db.selectFrom('operators').select('login').where('id','=',id).executeTakeFirstOrThrow()).login;
  await expect(login(db,name,'synthetic-user-password-2026',clock)).rejects.toMatchObject({status:401});
  await settings({enabled:false});
  const local=await login(db,name,'synthetic-user-password-2026',clock);
  expect(await sessionStatus(db,local,clock)).toMatchObject({password_change_required:true,sign_in:{method:'local',provider_label:null}});
  await expect(flow()).rejects.toMatchObject({code:'oidc_unavailable'});
  await settings();
  expect((await sessionStatus(db,admin,clock)).sign_in).toEqual({method:'oidc',provider_label:'authentik'});
  await expect(sessionStatus(db,local,clock)).rejects.toMatchObject({status:401});
  await expect(login(db,name,'synthetic-user-password-2026',clock)).rejects.toMatchObject({status:401});
  // A stale session inserted outside the configuration writer is denied too.
  const op=await db.selectFrom('operators').selectAll().where('id','=',id).executeTakeFirstOrThrow();
  const stale=await db.transaction().execute(trx=>issueSession(trx,op,clock()));
  await expect(sessionStatus(db,stale,clock)).rejects.toMatchObject({status:401});
  await settings({enabled:false});await expect(sessionStatus(db,local,clock)).rejects.toMatchObject({status:401});
  await settings();expect((await sessionStatus(db,await login(db,'admin','synthetic-admin-password-2026',clock),clock)).role).toBe('admin');
 });
 it('does not let an OIDC User disconnect using a password that is blocked by the active mode',async()=>{
  person={sub:'one',groups:[]};const cookie=(await finish(await flow())).session!,profile=await readProfile(db,cookie,clock);
  await db.updateTable('operator_local_credentials').set({must_change_password:false}).where('operator_id','=',profile.id).execute();
  await expect(unlinkIdentity(db,cookie,{expected_revision:await revision(),identity_id:profile.identities[0]!.id},clock,randomUUID())).rejects.toMatchObject({code:'local_password_required'});
  expect((await readProfile(db,cookie,clock)).identities).toHaveLength(1);
  await db.updateTable('operator_local_credentials').set({must_change_password:true}).where('operator_id','=',profile.id).execute();
 });
 it('rejects enabling OIDC without its secret and leaves the saved mode untouched',async()=>{
  await settings({enabled:false});
  await expect(saveOidcSettings(db,admin,{expected_revision:await revision(),label:'authentik',issuer,client_id:'test-client',enabled:true,groups_claim:'groups',mappings:[]},clock,undefined,randomUUID())).rejects.toMatchObject({code:'oidc_secret_required'});
  expect((await sessionStatus(db,admin,clock)).sign_in.method).toBe('local');await settings();
 });
 it('synchronizes external groups, retains manual groups and bounds residual provider access',async()=>{
  const id=(await db.selectFrom('operator_external_identities').select('operator_id').where('subject','=','one').executeTakeFirstOrThrow()).operator_id;await edit(id,{add_groups:[secondGroup]});
  person={sub:'one',groups:['storage']};let result=await finish(await flow());expect((await readProfile(db,result.session!,clock)).provider_groups.map(g=>g.name)).toEqual(['Storage']);
  const manual=await db.selectFrom('access_group_members').select('group_id').where('operator_id','=',id).execute();expect(manual.map(m=>m.group_id)).toEqual([secondGroup]);
  person={sub:'one',groups:[]};const previous=result.session!;result=await finish(await flow());await expect(sessionStatus(db,previous,clock)).rejects.toMatchObject({status:401});expect((await readProfile(db,result.session!,clock)).provider_groups).toHaveLength(0);
  const still=await db.selectFrom('access_effective_group_members').select('group_id').where('operator_id','=',id).execute();expect(still.map(g=>g.group_id)).toEqual([secondGroup]);
  person={sub:'one',groups:['storage']};result=await finish(await flow());await db.updateTable('access_external_memberships').set({valid_until:new Date(Date.now()-1)}).where('operator_id','=',id).execute();expect((await db.selectFrom('access_effective_group_members').select('group_id').where('operator_id','=',id).execute()).map(g=>g.group_id)).toEqual([secondGroup]);
  await expect(sessionStatus(db,result.session!,()=>new Date(now.getTime()+3600000))).rejects.toMatchObject({status:401});
 });
 it('revokes pending attempts, sessions and groups; every provider-authorized identity can get a User account',async()=>{
  person={sub:'one',groups:['storage']};const session=(await finish(await flow())).session!,pending=await flow();await settings();await expect(finish(pending)).rejects.toMatchObject({code:'oidc_failed'});await expect(sessionStatus(db,session,clock)).rejects.toMatchObject({status:401});
  // Legacy stored opt-out no longer limits provider-authorized admission.
  await db.updateTable('oidc_providers').set({auto_create:false}).execute();
  person={sub:'new-unlinked',groups:[]};const fresh=(await finish(await flow())).session!;
  const current=await sessionStatus(db,fresh,clock);expect(current).toMatchObject({role:'user',local_password:false,auth_method:'oidc'});
  expect((await readProfile(db,fresh,clock)).provider_groups).toEqual([]);
  expect(await db.selectFrom('access_user_hosts').selectAll().where('operator_id','=',current.access.account_id).execute()).toEqual([]);
  const returning=(await finish(await flow())).session!;expect((await sessionStatus(db,returning,clock)).access.account_id).toBe(current.access.account_id);
  await edit(current.access.account_id,{disabled:true});await expect(finish(await flow())).rejects.toMatchObject({status:401});
  await expect(settings({issuer:'https://other.example.test/'})).rejects.toMatchObject({code:'oidc_identity_immutable'});
 });
 it('refuses cross-origin/redirect provider endpoints and isolates the callback cookie from ordinary session CSRF',async()=>{
  const p=await db.selectFrom('oidc_providers').selectAll().executeTakeFirstOrThrow();const bad:typeof fetch=async()=>new Response(JSON.stringify({issuer,authorization_endpoint:'https://attacker.example.test/auth',token_endpoint:'https://attacker.example.test/token',jwks_uri:'https://attacker.example.test/keys'}),{headers:{'content-type':'application/json'}});
  await expect(oidcConfiguration(p,secret,bad)).rejects.toMatchObject({code:'oidc_invalid_endpoint'});
  const ctx:HttpContext={db,clock,config:{origin,databaseUrl:url!,heartbeatIntervalSeconds:60,staleAfterSeconds:180,oidcSecret:secret}};
  expect((await oidcStart(new Request(origin+'/api/v1/operator/oidc/start',{method:'POST',headers:{origin:'https://attacker.example.test','content-type':'application/json','x-tinywarden-request':'1'},body:JSON.stringify({schema_version:1,intent:'login'})}),ctx)).status).toBe(403);
  const failed=await oidcCallback(new Request(origin+'/api/v1/operator/oidc/callback?state=wrong&code=wrong'),ctx);expect(failed.status).toBe(303);expect(failed.headers.get('location')).toBe('/login?oidc=failed');expect(failed.headers.get('set-cookie')).not.toContain(sessionCookie+'=');
 });
 it('preserves a usable local admin while SSO is enabled',async()=>{
  const peer=(await db.selectFrom('operator_external_identities').select('operator_id').where('subject','=','one').executeTakeFirstOrThrow()).operator_id;
  await edit(peer,{role:'admin'});person={sub:'one',groups:[]};const peerCookie=(await finish(await flow())).session!;
  await expect(mutateAccess(db,peerCookie,'users',adminId,'save',{expected_revision:await revision(),role:'user',disabled:false,add_hosts:[],remove_hosts:[],add_groups:[],remove_groups:[]},clock)).rejects.toMatchObject({code:'local_admin_required'});
  expect((await db.selectFrom('operators').select('role').where('id','=',adminId).executeTakeFirstOrThrow()).role).toBe('admin');await edit(peer);
 });
 it('prevents an administrator overwriting a concurrent own-profile change',async()=>{
  const old=await readProfile(db,admin,clock);await saveProfile(db,admin,{expected_revision:old.revision,display_name:'Fresh profile',email:old.email},clock,randomUUID());
  await expect(edit(adminId,{role:'admin',display_name:'Stale admin draft',email:old.email,expected_profile_revision:old.revision})).rejects.toMatchObject({code:'settings_conflict'});
  expect((await readProfile(db,admin,clock)).display_name).toBe('Fresh profile');
 });
 it('disconnect requires a usable alternate login and removing a provider leaves manual assignments',async()=>{
  person={sub:'admin-external',groups:[]};await unlinkIdentity(db,admin,{expected_revision:await revision(),identity_id:(await readProfile(db,admin,clock)).identities[0]!.id},clock,randomUUID());expect((await readProfile(db,admin,clock)).identities).toHaveLength(0);
  const linked=await db.selectFrom('operator_external_identities').select('operator_id').where('subject','=','one').executeTakeFirstOrThrow(),account={id:linked.operator_id},rows=await readAccess(db,admin,'users',{page:1,search:''},clock);expect(rows.items.find(i=>i.id===account.id)).toMatchObject({local_password:true});
  await settings({enabled:false});expect(await db.selectFrom('access_group_members').selectAll().where('operator_id','=',account.id).execute()).toHaveLength(1);
 });
 it('rejects malformed group claims',()=>{for(const v of ['admin',[{name:'admin'}],Array(257).fill('a')])expect(()=>claimGroups(v)).toThrow();expect(claimGroups(['a','a'])).toEqual(['a']);});
});
