import {sql,type Kysely} from 'kysely';
import type {Database} from '../db/types';
import {assertDatabaseTarget} from '../db/target';
import {accessGate} from '../access/scope';
import {ms} from '../validation';
import type {Clock} from '../access/operator';
import {newEmailTicket} from './tickets';
import type {AccountMailSettings} from './config';
import {composeAccountMail,type AccountMail} from './message';
import {submitSmtp} from '../email/transport';
import type {Outcome} from '../notifications/types';
export type AccountMailSender=(mail:AccountMail)=>Promise<Outcome>;
export function accountSmtpSender(settings:AccountMailSettings,origin:string):AccountMailSender{return async mail=>{
 const message=await composeAccountMail(settings,origin,mail);return submitSmtp({...settings,to:mail.to},message,AbortSignal.timeout(15000),undefined,15000);
};}
export async function runAccountEmails(db:Kysely<Database>,expected:string,origin:string,sender:AccountMailSender,clock:Clock=()=>new Date()){
 await assertDatabaseTarget(db,expected);let sent=0,skipped=0,uncertain=0,failed=0;
 await db.transaction().execute(async trx=>{const at=ms(clock());await trx.deleteFrom('account_email_tokens').where('expires_at','<=',at).execute();
 await trx.deleteFrom('account_email_throttle').where('started_at','<',new Date(at.getTime()-7200000)).execute();
 // Claimed jobs contain no bearer secret. Replaying after a worker interruption
 // could deliver duplicate or misleading links, so abandon instead of retrying.
 await trx.updateTable('account_email_jobs').set({state:'done',outcome:'abandoned',finished_at:at}).where('state','=','claimed').where('claimed_at','<',new Date(at.getTime()-120000)).execute();
 await trx.updateTable('account_email_jobs').set({state:'done',outcome:'skipped',finished_at:at}).where('state','=','queued').where('created_at','<',new Date(at.getTime()-600000)).execute();
 await trx.deleteFrom('account_email_jobs').where('state','=','done').where('created_at','<',new Date(at.getTime()-86400000)).execute();});
 for(let i=0;i<32&&sent+failed+uncertain<2;i++){
 const prepared=await db.transaction().execute(async trx=>{await accessGate(trx);const job=await trx.selectFrom('account_email_jobs').selectAll().where('state','=','queued')
 .orderBy(sql`CASE purpose WHEN 'reset_notice' THEN 0 WHEN 'verify' THEN 1 ELSE 2 END`).orderBy('created_at').orderBy('id').forUpdate().skipLocked().executeTakeFirst();if(!job)return null;
 const at=ms(clock());await trx.updateTable('account_email_jobs').set({state:'claimed',claimed_at:at}).where('id','=',job.id).execute();
 const op=await trx.selectFrom('operators').selectAll().where('login','=',job.login).forUpdate().executeTakeFirst();
 const profile=op?await trx.selectFrom('operator_profiles').selectAll().where('operator_id','=',op.id).forUpdate().executeTakeFirst():null;
 const credential=op?await trx.selectFrom('operator_local_credentials').selectAll().where('operator_id','=',op.id).executeTakeFirst():null;
 const notice=job.purpose==='reset_notice';
 const eligible=notice?!!job.email:!!op&&!op.disabled_at&&!!profile?.email&&(job.purpose==='reset'?!!profile.email_verified_at&&!!credential&&job.created_at>=credential.password_changed_at:!profile.email_verified_at&&op.id===job.operator_id&&op.auth_version===job.auth_version&&profile.email_revision===job.email_revision&&profile.email===job.email);
 if(!eligible){await trx.updateTable('account_email_jobs').set({state:'done',outcome:'skipped',finished_at:at}).where('id','=',job.id).execute();return {skip:true as const};}
 let link:string|null=null;
 if(!notice){const purpose=job.purpose as 'verify'|'reset',token=newEmailTicket(purpose);
 await trx.deleteFrom('account_email_tokens').where('operator_id','=',op!.id).where('purpose','=',purpose).execute();
 await trx.insertInto('account_email_tokens').values({id:token.id,operator_id:op!.id,purpose,secret_digest:token.digest,auth_version:op!.auth_version,email_revision:profile!.email_revision,email:profile!.email!,issued_at:at,expires_at:new Date(at.getTime()+(purpose==='verify'?3600000:1800000))}).execute();
 link=origin+(purpose==='verify'?'/verify-email':'/reset-password')+'#token='+token.value;
 }
 return {id:job.id,mail:{id:job.id,purpose:job.purpose,to:notice?job.email!:profile!.email!,login:job.login,at,link} satisfies AccountMail};
 });
 if(!prepared)break;if('skip' in prepared){skipped++;continue;}
 let outcome:Outcome;try{outcome=await sender(prepared.mail);}catch{outcome={kind:'uncertain',code:'submission_unknown'};}
 const result=outcome.kind==='accepted'?'sent':outcome.kind==='captured'?'failed':outcome.kind==='uncertain'?'uncertain':'failed';
 await db.updateTable('account_email_jobs').set({state:'done',outcome:result,finished_at:ms(clock())}).where('id','=',prepared.id).where('state','=','claimed').execute();
 if(result==='sent')sent++;else if(result==='uncertain')uncertain++;else failed++;
 }
 return {sent,skipped,failed,uncertain};
}
