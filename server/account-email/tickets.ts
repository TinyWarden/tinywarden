import {createHash,randomBytes,randomUUID} from 'node:crypto';
import type {Kysely,Transaction} from 'kysely';
import type {Database} from '../db/types';
import type {EmailPurpose} from '../db/account-email-types';
import {fail} from '../errors';
import {ms,sameDigest} from '../validation';
import {accessGate} from '../access/scope';
import {advanceAccess,replaceCredential,type Clock} from '../access/operator';
import {hashPassword} from '../access/password';
import {audit} from '../access/audit';
import {reserveTicketAttempt} from './requests';
const pattern=/^tw_(verify|reset)_([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;
export function newEmailTicket(purpose:EmailPurpose){const id=randomUUID(),secret=randomBytes(32).toString('base64url');return {id,value:`tw_${purpose}_${id}.${secret}`,digest:createHash('sha256').update(secret).digest()};}
function parsed(raw:unknown,purpose:EmailPurpose){if(typeof raw!=='string')fail('recovery_link_invalid',410);const m=pattern.exec(raw);if(!m||m[1]!==purpose)fail('recovery_link_invalid',410);return {id:m[2]!,digest:createHash('sha256').update(m[3]!).digest()};}
async function readTicket(trx:Transaction<Database>,raw:unknown,purpose:EmailPurpose,clock:Clock){
 const token=parsed(raw,purpose),ticket=await trx.selectFrom('account_email_tokens').selectAll().where('id','=',token.id).executeTakeFirst(),at=ms(clock());
 if(!ticket||ticket.purpose!==purpose||!sameDigest(ticket.secret_digest,token.digest)||at<ticket.issued_at||at>=ticket.expires_at)fail('recovery_link_invalid',410);
 const op=await trx.selectFrom('operators').selectAll().where('id','=',ticket.operator_id).forUpdate().executeTakeFirst(),profile=await trx.selectFrom('operator_profiles').selectAll().where('operator_id','=',ticket.operator_id).forUpdate().executeTakeFirst();
 if(!op||op.disabled_at||op.auth_version!==ticket.auth_version||!profile||profile.email!==ticket.email||profile.email_revision!==ticket.email_revision)fail('recovery_link_invalid',410);
 if(purpose==='reset'&&(!profile.email_verified_at||!await trx.selectFrom('operator_local_credentials').select('operator_id').where('operator_id','=',op.id).executeTakeFirst()))fail('recovery_link_invalid',410);
 return {ticket,op,profile,at};
}
export async function verifyEmail(db:Kysely<Database>,raw:unknown,clock:Clock,correlationId:string){
 await reserveTicketAttempt(db,clock);return db.transaction().execute(async trx=>{const revision=await accessGate(trx,true),v=await readTicket(trx,raw,'verify',clock);
 const next=Number(v.profile.revision)+1;if(!Number.isSafeInteger(next))fail('version_exhausted',409);
 await trx.updateTable('operator_profiles').set({email_verified_at:v.at,revision:next}).where('operator_id','=',v.op.id).execute();await trx.deleteFrom('account_email_tokens').where('id','=',v.ticket.id).execute();
 await audit(trx,{action:'operator.email_verified',actorKind:'system',targetOperatorId:v.op.id,at:v.at,correlationId});return {revision};
 });
}
export async function recoverPassword(db:Kysely<Database>,raw:unknown,password:unknown,clock:Clock,correlationId:string){
 await reserveTicketAttempt(db,clock);
 const initial=await db.transaction().execute(async trx=>{await accessGate(trx);return readTicket(trx,raw,'reset',clock);});
 const hashed=await hashPassword(password);
 await db.transaction().execute(async trx=>{await accessGate(trx,true);const v=await readTicket(trx,raw,'reset',clock);
 if(v.op.id!==initial.op.id||v.op.auth_version!==initial.op.auth_version)fail('recovery_link_invalid',410);
 await replaceCredential(trx,v.op.id,v.op.auth_version,hashed,v.at,false);
 await trx.deleteFrom('account_email_tokens').where('operator_id','=',v.op.id).execute();
 await trx.deleteFrom('access_external_memberships').where('operator_id','=',v.op.id).execute();await advanceAccess(trx);
 await audit(trx,{action:'operator.password_reset',actorKind:'system',targetOperatorId:v.op.id,at:v.at,correlationId});
 });
}
