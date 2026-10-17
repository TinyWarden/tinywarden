import {randomUUID} from 'node:crypto';
import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import SMTPConnection from 'nodemailer/lib/smtp-connection/index.js';
import {smtpFixture} from './p4b.smtp.fixture';
import {submitSmtp} from '../server/email/transport';
import {sql} from 'kysely';
import {createDb} from '../server/db/client';
import {migrate} from '../server/db/migrate';
import {credentialValues,replaceCredential} from '../server/access/operator';
import {hashPassword,verifyPassword} from '../server/access/password';
import {issueSession,sessionStatus,sessionCookie} from '../server/access/session';
import {readProfile,saveProfile} from '../server/access/profile';
import {accessGate} from '../server/access/scope';
import {enqueueRecovery,enqueueVerification} from '../server/account-email/requests';
import {verifyEmail,recoverPassword} from '../server/account-email/tickets';
import {runAccountEmails} from '../server/account-email/worker';
import {accountMailSettings} from '../server/account-email/config';
import {composeAccountMail,type AccountMail} from '../server/account-email/message';
import {requestPasswordRecovery,confirmPasswordRecovery,requestVerification,confirmVerification} from '../server/http/account-email-handlers';
import type {HttpContext} from '../server/http/response';
const url=process.env.TW_TEST_DATABASE_URL;
if(url&&new URL(url).pathname!=='/tinywarden_test_p1b')throw new Error('reserved_database_required');
const oldPassword='synthetic-recovery-password-2026',newPassword='synthetic-new-password-2026',origin='https://app.example.test';
const mailSettings=accountMailSettings({NOTIFICATIONS_TRANSPORT:'smtp',NOTIFICATIONS_FROM:'security@example.test',SMTP_HOST:'smtp.example.test',SMTP_PORT:'465',SMTP_SECURE:'true',SMTP_USER:'test',SMTP_PASSWORD:'synthetic-password'})!;
describe.skipIf(!url)('Email verification and local recovery',()=>{
 const db=createDb(url!);let now=new Date(),hashed:Awaited<ReturnType<typeof hashPassword>>,mails:AccountMail[]=[];
 const clock=()=>new Date(now),run=()=>runAccountEmails(db,'tinywarden_test_p1b',origin,async mail=>{mails.push(mail);return {kind:'accepted',code:'relay_accepted'};},clock);
 const token=(mail:AccountMail)=>new URL(mail.link!).hash.slice(7);
 const ctx=():HttpContext=>({db,clock,config:{databaseUrl:url!,origin,accountMail:mailSettings,heartbeatIntervalSeconds:60,staleAfterSeconds:180}});
 const post=(path:string,body:object,cookie?:string)=>new Request(origin+'/api/v1/operator/'+path,{method:'POST',headers:{origin,'x-tinywarden-request':'1','content-type':'application/json',...(cookie?{cookie:sessionCookie+'='+cookie}:{})},body:JSON.stringify({schema_version:1,...body})});
 async function user(options:{local?:boolean;verified?:boolean;email?:string|null;disabled?:boolean;role?:'admin'|'user'}={}){
  const id=randomUUID(),login='u'+id.slice(0,8),email=options.email===undefined?login+'@example.test':options.email;
  await db.insertInto('operators').values({id,login,role:options.role??'user',disabled_at:options.disabled?now:null,recovery_admin:false,auth_version:1,created_at:now}).execute();
  if(options.local!==false)await db.insertInto('operator_local_credentials').values({operator_id:id,...credentialValues(hashed,now,false)}).execute();
  await db.insertInto('operator_profiles').values({operator_id:id,display_name:'Synthetic',email,email_verified_at:options.verified?now:null,revision:1}).execute();
  const cookie=await db.transaction().execute(trx=>issueSession(trx,{id,auth_version:'1'},now));return {id,login,email,cookie};
 }
 const verifyRequest=async(u:Awaited<ReturnType<typeof user>>,password:unknown=oldPassword)=>{const p=await readProfile(db,u.cookie,clock);return enqueueVerification(db,u.cookie,{expected_revision:p.revision,current_password:password},clock,randomUUID());};
 beforeAll(async()=>{await sql`DROP SCHEMA IF EXISTS tinywarden CASCADE`.execute(db);await sql`CREATE SCHEMA tinywarden AUTHORIZATION tinywarden`.execute(db);await migrate(url!,'tinywarden_test_p1b');hashed=await hashPassword(oldPassword);},30000);
 beforeEach(async()=>{now=new Date();mails=[];await db.updateTable('oidc_providers').set({enabled:false}).execute();await db.deleteFrom('account_email_tokens').execute();await db.deleteFrom('account_email_jobs').execute();await db.deleteFrom('account_email_throttle').execute();});
 afterAll(()=>db.destroy());
 it('requires current local password and queues no bearer token; worker sends only to the saved address',async()=>{
  const u=await user();await expect(verifyRequest(u,'wrong-password-long-enough')).rejects.toMatchObject({code:'invalid_password'});expect(await db.selectFrom('account_email_jobs').selectAll().execute()).toHaveLength(0);
  await verifyRequest(u);const jobs=await db.selectFrom('account_email_jobs').selectAll().execute();expect(jobs).toHaveLength(1);expect(JSON.stringify(jobs)).not.toContain('tw_verify_');expect(await db.selectFrom('account_email_tokens').selectAll().execute()).toHaveLength(0);
  expect(await run()).toMatchObject({sent:1});expect(mails[0]!.to).toBe(u.email);const rows=await db.selectFrom('account_email_tokens').selectAll().execute();expect(rows[0]!.secret_digest).toHaveLength(32);expect(rows[0]!.expires_at.getTime()-rows[0]!.issued_at.getTime()).toBe(3600000);expect(JSON.stringify(rows)).not.toContain(token(mails[0]!));
  expect((await readProfile(db,u.cookie,clock)).email_verified).toBe(false);await verifyEmail(db,token(mails[0]!),clock,randomUUID());expect((await readProfile(db,u.cookie,clock)).email_verified).toBe(true);await expect(verifyEmail(db,token(mails[0]!),clock,randomUUID())).rejects.toMatchObject({status:410});
 });
 it('preserves verification tickets on display-name edits, invalidates A→B→A email changes',async()=>{
  const u=await user();await verifyRequest(u);await run();let p=await readProfile(db,u.cookie,clock);await saveProfile(db,u.cookie,{expected_revision:p.revision,display_name:'New name',email:p.email},clock,randomUUID());await verifyEmail(db,token(mails[0]!),clock,randomUUID());
  const second=await user();mails=[];await verifyRequest(second);await run();p=await readProfile(db,second.cookie,clock);await saveProfile(db,second.cookie,{expected_revision:p.revision,display_name:p.display_name,email:'different@example.test'},clock,randomUUID());p=await readProfile(db,second.cookie,clock);await saveProfile(db,second.cookie,{expected_revision:p.revision,display_name:p.display_name,email:second.email},clock,randomUUID());await expect(verifyEmail(db,token(mails[0]!),clock,randomUUID())).rejects.toMatchObject({status:410});
 });
 it('rejects expired, wrong-purpose and forged links; concurrent confirmation succeeds only once',async()=>{
  const u=await user();await verifyRequest(u);await run();const value=token(mails[0]!);await expect(recoverPassword(db,value,newPassword,clock,randomUUID())).rejects.toMatchObject({status:410});await expect(verifyEmail(db,value.slice(0,-1)+(value.endsWith('A')?'B':'A'),clock,randomUUID())).rejects.toMatchObject({status:410});
  const results=await Promise.allSettled([verifyEmail(db,value,clock,randomUUID()),verifyEmail(db,value,clock,randomUUID())]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  const v=await user();mails=[];await verifyRequest(v);await run();now=new Date(now.getTime()+3600000);await expect(verifyEmail(db,token(mails[0]!),clock,randomUUID())).rejects.toMatchObject({status:410});
 });
 it('revalidates verification jobs against email, active state and credential changes before delivery',async()=>{
  const u=await user();await verifyRequest(u);await db.updateTable('operators').set({auth_version:2}).where('id','=',u.id).execute();expect(await run()).toMatchObject({sent:0,skipped:1});
  const v=await user();await verifyRequest(v);await db.updateTable('operator_profiles').set({email:'changed@example.test',email_revision:2}).where('operator_id','=',v.id).execute();expect(await run()).toMatchObject({sent:0,skipped:1});
  const w=await user();await verifyRequest(w);await db.updateTable('operators').set({disabled_at:now}).where('id','=',w.id).execute();expect(await run()).toMatchObject({sent:0,skipped:1});
 });
 it('returns identical anonymous replies and defers account eligibility to the worker',async()=>{
  const known=await user({verified:true}),unverified=await user(),disabled=await user({verified:true,disabled:true}),sso=await user({verified:true,local:false}),none=await user({email:null});const replies=[];
  for(const u of [known,unverified,disabled,sso,none,{login:'unknown-user'}]){const r=await requestPasswordRecovery(post('password-recovery/request',{login:u.login}),ctx());expect(r.status).toBe(202);replies.push(await r.json());}
  expect(new Set(replies.map(r=>JSON.stringify(r))).size).toBe(1);expect(await db.selectFrom('account_email_jobs').selectAll().execute()).toHaveLength(6);expect(await run()).toMatchObject({sent:1,skipped:5});expect(mails[0]!.to).toBe(known.email);
 });
 it('resets only an existing local credential, revokes all sessions and tickets, preserves role/grants and queues a change notice',async()=>{
  const u=await user({verified:true,role:'admin'});await enqueueRecovery(db,u.login,clock);await run();const value=token(mails[0]!),row=await db.selectFrom('account_email_tokens').selectAll().executeTakeFirstOrThrow();expect(row.expires_at.getTime()-row.issued_at.getTime()).toBe(1800000);
  const second=await db.transaction().execute(trx=>issueSession(trx,{id:u.id,auth_version:'1'},now));const group=randomUUID();await db.insertInto('access_groups').values({id:group,name:'Synthetic '+group,created_at:now}).execute();await db.insertInto('access_group_members').values({operator_id:u.id,group_id:group}).execute();
  const provider=randomUUID();await db.insertInto('oidc_providers').values({id:provider,label:'authentik',issuer:'https://auth.example.test/',client_id:'test',enabled:true,auto_create:false,groups_claim:'groups',revision:1}).execute();const identity=randomUUID();await db.insertInto('operator_external_identities').values({id:identity,operator_id:u.id,provider_id:provider,protocol:'oidc',issuer:'https://auth.example.test/',subject:'test',created_at:now}).execute();await db.insertInto('access_external_memberships').values({operator_id:u.id,provider_id:provider,group_id:group,valid_until:new Date(now.getTime()+3600000)}).execute();const ssoCookie=await db.transaction().execute(trx=>issueSession(trx,{id:u.id,auth_version:'1'},now,3600000,identity));
  const r=await confirmPasswordRecovery(post('password-recovery/reset',{token:value,new_password:newPassword}),ctx());expect(r.status).toBe(200);expect(r.headers.get('set-cookie')).toContain('Max-Age=0');expect(await db.selectFrom('account_email_tokens').selectAll().execute()).toHaveLength(0);for(const cookie of [u.cookie,second,ssoCookie])await expect(sessionStatus(db,cookie,clock)).rejects.toMatchObject({status:401});
  expect((await db.selectFrom('operators').selectAll().where('id','=',u.id).executeTakeFirstOrThrow()).role).toBe('admin');expect(await db.selectFrom('access_group_members').selectAll().where('operator_id','=',u.id).execute()).toHaveLength(1);expect(await db.selectFrom('access_external_memberships').selectAll().where('operator_id','=',u.id).execute()).toHaveLength(0);
  const cred=await db.selectFrom('operator_local_credentials').selectAll().where('operator_id','=',u.id).executeTakeFirstOrThrow();expect(await verifyPassword(newPassword,cred)).toBe(true);expect(cred.must_change_password).toBe(false);await expect(recoverPassword(db,value,newPassword,clock,randomUUID())).rejects.toMatchObject({status:410});await run();expect(mails.at(-1)).toMatchObject({purpose:'reset_notice',to:u.email,link:null});
 });
 it('rejects expired reset links and later email, credential, disable or local-login removal',async()=>{
  for(const change of ['expiry','email','credential','disabled','local'] as const){const u=await user({verified:true});mails=[];await enqueueRecovery(db,u.login,clock);await run();const value=token(mails[0]!);
   if(change==='expiry')now=new Date(now.getTime()+1800000);
   if(change==='email')await db.updateTable('operator_profiles').set({email:'another@example.test',email_verified_at:null,email_revision:2}).where('operator_id','=',u.id).execute();
   if(change==='credential')await db.transaction().execute(async trx=>{await accessGate(trx,true);await replaceCredential(trx,u.id,'1',hashed,now,false);});
   if(change==='disabled')await db.updateTable('operators').set({disabled_at:now}).where('id','=',u.id).execute();
   if(change==='local')await db.deleteFrom('operator_local_credentials').where('operator_id','=',u.id).execute();
   await expect(recoverPassword(db,value,newPassword,clock,randomUUID())).rejects.toMatchObject({status:410});now=new Date();await db.deleteFrom('account_email_jobs').execute();}
 });
 it('allows recent SSO-only verification without creating local credentials, requires password proof for hybrid accounts',async()=>{
  await db.updateTable('oidc_providers').set({enabled:true}).execute();
  const p=await db.selectFrom('oidc_providers').selectAll().executeTakeFirstOrThrow();const u=await user({local:false}),identity=randomUUID();await db.insertInto('operator_external_identities').values({id:identity,operator_id:u.id,provider_id:p.id,protocol:'oidc',issuer:p.issuer,subject:randomUUID(),created_at:now}).execute();u.cookie=await db.transaction().execute(trx=>issueSession(trx,{id:u.id,auth_version:'1'},now,3600000,identity));await verifyRequest(u,null);await run();await verifyEmail(db,token(mails[0]!),clock,randomUUID());expect(await db.selectFrom('operator_local_credentials').selectAll().where('operator_id','=',u.id).execute()).toHaveLength(0);mails=[];await enqueueRecovery(db,u.login,clock);await run();expect(mails).toHaveLength(0);
  const v=await user({local:false}),i=randomUUID();await db.insertInto('operator_external_identities').values({id:i,operator_id:v.id,provider_id:p.id,protocol:'oidc',issuer:p.issuer,subject:randomUUID(),created_at:now}).execute();v.cookie=await db.transaction().execute(trx=>issueSession(trx,{id:v.id,auth_version:'1'},new Date(now.getTime()-16*60000),3600000,i));await expect(verifyRequest(v,null)).rejects.toMatchObject({code:'email_recent_sign_in_required'});
  const h=await user(),hi=randomUUID();await db.insertInto('operator_external_identities').values({id:hi,operator_id:h.id,provider_id:p.id,protocol:'oidc',issuer:p.issuer,subject:randomUUID(),created_at:now}).execute();h.cookie=await db.transaction().execute(trx=>issueSession(trx,{id:h.id,auth_version:'1'},now,3600000,hi));await expect(verifyRequest(h,null)).rejects.toThrow();await verifyRequest(h);
 });
 it('suppresses repeated requests, invalidates previous links on resend and bounds delivery',async()=>{
  const u=await user({verified:true});await enqueueRecovery(db,u.login,clock);await enqueueRecovery(db,u.login,clock);expect(await db.selectFrom('account_email_jobs').selectAll().execute()).toHaveLength(1);await run();const old=token(mails[0]!);now=new Date(now.getTime()+61000);await enqueueRecovery(db,u.login,clock);await run();await expect(recoverPassword(db,old,newPassword,clock,randomUUID())).rejects.toMatchObject({status:410});
  for(let i=0;i<3;i++)await enqueueRecovery(db,(await user({verified:true})).login,clock);expect(await run()).toMatchObject({sent:2});expect(await db.selectFrom('account_email_jobs').selectAll().where('state','=','queued').execute()).toHaveLength(1);
 });
 it('does not replay uncertain deliveries or crashed claims; expiry cleanup remains bounded',async()=>{
  const u=await user({verified:true});await enqueueRecovery(db,u.login,clock);let attempts=0;expect(await runAccountEmails(db,'tinywarden_test_p1b',origin,async()=>{attempts++;throw new Error('synthetic interruption');},clock)).toMatchObject({uncertain:1});await run();expect(attempts).toBe(1);expect(mails).toHaveLength(0);
  const v=await user({verified:true});await enqueueRecovery(db,v.login,clock);await db.updateTable('account_email_jobs').set({state:'claimed',claimed_at:new Date(now.getTime()-180000)}).where('login','=',v.login).execute();await run();expect((await db.selectFrom('account_email_jobs').select('outcome').where('login','=',v.login).executeTakeFirstOrThrow()).outcome).toBe('abandoned');
 });
 it('keeps request limits separate from login and releases row locks before SMTP',async()=>{
  const u=await user({verified:true});await enqueueRecovery(db,u.login,clock);
  let checked=false;await runAccountEmails(db,'tinywarden_test_p1b',origin,async()=>{await db.transaction().execute(trx=>trx.selectFrom('operators').select('id').where('id','=',u.id).forUpdate().noWait().execute());checked=true;return {kind:'accepted',code:'relay_accepted'};},clock);expect(checked).toBe(true);
  await db.deleteFrom('account_email_throttle').execute();for(let i=0;i<90;i++)await enqueueRecovery(db,'unknown-'+i,clock);await expect(enqueueRecovery(db,'unknown-91',clock)).rejects.toMatchObject({status:429});
 });
 it('enforces origin, body bounds and public link confirmation as explicit POST',async()=>{
  const u=await user();expect((await requestVerification(post('email/request',{expected_revision:'1',current_password:oldPassword},u.cookie),ctx())).status).toBe(202);await run();expect((await readProfile(db,u.cookie,clock)).email_verified).toBe(false);
  const r=post('email/verify',{token:token(mails[0]!)});r.headers.set('origin','https://attacker.example.test');expect((await confirmVerification(r,ctx())).status).toBe(403);expect((await confirmVerification(post('email/verify',{token:token(mails[0]!)}),ctx())).status).toBe(200);
  expect((await requestPasswordRecovery(post('password-recovery/request',{login:'bad user'}),ctx())).status).toBe(400);
  const disabled=ctx();delete disabled.config.accountMail;expect((await requestPasswordRecovery(post('password-recovery/request',{login:'nobody'}),disabled)).status).toBe(202);
 });
});
describe('Account mail rendering/configuration',()=>{
 it('uses only configured SMTP and a validated account recipient with safe, bounded catalog content',async()=>{
  const mail:AccountMail={id:randomUUID(),purpose:'verify',login:'synthetic<name>',to:'account@example.test',at:new Date(),link:origin+'/verify-email#token=synthetic'};
  const message=(await composeAccountMail(mailSettings,origin,mail)).toString(),headers=message.split('\r\n\r\n')[0]!;expect(message.length).toBeLessThan(16384);expect(headers).toContain('To: account@example.test');expect(headers).not.toContain('synthetic<name>');expect(message).not.toContain(mailSettings.smtp.password);expect(message).toContain('synthetic&lt;name&gt;');
  await expect(composeAccountMail(mailSettings,origin,{...mail,to:'person@example.test\r\nBcc: other@example.test'})).rejects.toThrow();await expect(composeAccountMail(mailSettings,origin,{...mail,link:'https://attacker.example.test/reset-password'})).rejects.toThrow();
 });
 it('submits a verification MIME message to the account recipient through the shared verified-TLS adapter',async()=>{
  const fixture=await smtpFixture('accepted'),options:SMTPConnection.Options[]=[];
  try{const to='account@example.test',message=await composeAccountMail(mailSettings,origin,{id:randomUUID(),purpose:'verify',login:'synthetic',to,at:new Date(),link:origin+'/verify-email#token=synthetic'});
   const result=await submitSmtp({...mailSettings,to},message,new AbortController().signal,configured=>{options.push(configured);return new SMTPConnection({...configured,host:'127.0.0.1',port:fixture.port,secure:false,ignoreTLS:true,requireTLS:false});},2000);
   expect(result.kind).toBe('accepted');expect(options[0]).toMatchObject({secure:true,tls:{rejectUnauthorized:true},logger:false,debug:false});expect(fixture.counts().messages).toBe(1);
  }finally{await fixture.close();}
 });
 it('defaults to the existing SMTP transport, supports independent disable/from, and does not treat capture as delivery',()=>{
  expect(accountMailSettings({})).toBeNull();expect(accountMailSettings({NOTIFICATIONS_TRANSPORT:'capture'})).toBeNull();expect(accountMailSettings({ACCOUNT_EMAILS_TRANSPORT:'disabled',NOTIFICATIONS_TRANSPORT:'smtp'})).toBeNull();expect(()=>accountMailSettings({ACCOUNT_EMAILS_TRANSPORT:'capture'})).toThrow();
 });
});
