import {randomUUID} from 'node:crypto';
import type {Transaction} from 'kysely';
import type {Database} from '../db/types';
export async function passwordNotice(trx:Transaction<Database>,id:string,at:Date){
 const p=await trx.selectFrom('operator_profiles').selectAll().where('operator_id','=',id).executeTakeFirst();if(!p?.email||!p.email_verified_at)return;
 const op=await trx.selectFrom('operators').select(['login','auth_version']).where('id','=',id).executeTakeFirstOrThrow();
 await trx.insertInto('account_email_jobs').values({id:randomUUID(),purpose:'reset_notice',login:op.login,operator_id:id,auth_version:op.auth_version,email_revision:p.email_revision,email:p.email,state:'queued',outcome:null,created_at:at,claimed_at:null,finished_at:null}).execute();
}
