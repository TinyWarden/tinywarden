import {retentionPolicy} from "../data/retention-policy";
import type { Kysely, Transaction, Selectable } from "kysely";
import type { Database, Operators } from "../db/types";
import { AppError, fail } from "../errors";
import { ms, parseCredential, sameDigest, newCredential } from "../validation";
import {accessGate,accessView,type Role} from "./scope";
import {recordResponseAuthority} from "./response-context";
import { audit } from "./audit";

export const sessionCookie = "__Host-tinywarden_session";
export const cookieFlags = "Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800";

export function sessionFromCookie(header: string | null): string {
  if (!header || header.length > 4096) fail("unauthorized", 401);
  const matches = header.split(";").map((part) => part.trim())
    .filter((part) => part.startsWith(`${sessionCookie}=`));
  if (matches.length !== 1) fail("unauthorized", 401);
  return matches[0]!.slice(sessionCookie.length + 1);
}

export interface SessionContext {
  login:string; role:Role; localPassword:boolean; displayName:string; authMethod:"local"|"oidc"; accessRevision:string; passwordChangeRequired:boolean;
  operatorId: string; sessionId: string; expiresAt: Date; at: Date;
  issuedAt: Date; lastSeenAt: Date;
}

export async function authorize(trx: Transaction<Database>, cookie: string,
  clock: () => Date, restricted=false): Promise<SessionContext> {
  const accessRevision=await accessGate(trx);
  const parsed = parseCredential("session", cookie);
  const seen = await trx.selectFrom("operator_sessions").select(["operator_id"])
    .where("id", "=", parsed.id).executeTakeFirst();
  if (!seen) fail("unauthorized", 401);
  const operator = await trx.selectFrom("operators").selectAll()
    .where("id", "=", seen.operator_id).forUpdate().executeTakeFirst();
  if (!operator || operator.disabled_at) fail("unauthorized", 401);
  const session = await trx.selectFrom("operator_sessions").selectAll()
    .where("id", "=", parsed.id).forUpdate().executeTakeFirst();
  const at = ms(clock());
  if (!session || session.operator_id !== operator.id ||
      !sameDigest(session.secret_digest, parsed.digest) ||
      session.auth_version !== operator.auth_version ||
      at < session.issued_at || at < session.last_seen_at ||
      at >= session.expires_at || at.getTime() - session.last_seen_at.getTime() >= 30 * 60_000) {
    fail("unauthorized", 401);
  }
  const credential=await trx.selectFrom("operator_local_credentials").select("must_change_password").where("operator_id","=",operator.id).executeTakeFirst();
  if(session.auth_method==='oidc'){
    const identity=await trx.selectFrom('operator_external_identities as i').innerJoin('oidc_providers as p','p.id','i.provider_id').select('p.enabled').where('i.id','=',session.external_identity_id!).where('i.operator_id','=',operator.id).executeTakeFirst();
    if(!identity?.enabled)fail('unauthorized',401);
  }else if(operator.role==='user'&&await trx.selectFrom('oidc_providers').select('id').where('enabled','=',true).executeTakeFirst()){
    fail('unauthorized',401);
  }
  const profile=await trx.selectFrom('operator_profiles').select('display_name').where('operator_id','=',operator.id).executeTakeFirst();
  const passwordChangeRequired=session.auth_method==='local'&&(credential?.must_change_password??false);
  if(passwordChangeRequired&&!restricted)fail("password_change_required",403);
  const context={localPassword:!!credential,displayName:profile?.display_name??"",authMethod:session.auth_method,login:operator.login,role:operator.role,accessRevision,passwordChangeRequired, operatorId: operator.id, sessionId: session.id, expiresAt: session.expires_at,
    issuedAt: session.issued_at, lastSeenAt: session.last_seen_at, at };
  recordResponseAuthority(accessView(context));return context;
}

// The original session snapshot stays locked until the root finishes its later
// domain locks. Renew activity only after checking it at the root's effective time.
export async function completeAuthorization(trx: Transaction<Database>,
  context: SessionContext, rawAt: Date): Promise<Date> {
  const at = ms(rawAt);
  if (at < context.at || at < context.issuedAt || at < context.lastSeenAt ||
      at >= context.expiresAt || at.getTime() - context.lastSeenAt.getTime() >= 30 * 60_000) {
    fail("unauthorized", 401);
  }
  await trx.updateTable("operator_sessions").set({ last_seen_at: at })
    .where("id", "=", context.sessionId).execute();
  return at;
}

export async function sessionStatus(db: Kysely<Database>, cookie: string,
  clock: () => Date): Promise<{retention:{days:number;cutoff:string};login:string;display_name:string;local_password:boolean;auth_method:"local"|"oidc";role:Role;password_change_required:boolean;expires_at:string;sign_in:{method:"local"|"oidc";provider_label:string|null};access:{account_id:string;revision:string}}> {
  return db.transaction().execute(async (trx) => {
    const session = await authorize(trx, cookie, clock,true);
    const provider=await trx.selectFrom('oidc_providers').select('label').where('enabled','=',true).executeTakeFirst();
    await completeAuthorization(trx, session, session.at);
    const retention=await retentionPolicy(trx,session.at);
    return {retention:{days:retention.days,cutoff:retention.cutoff.toISOString()},sign_in:{method:provider?'oidc':'local',provider_label:provider?.label??null},display_name:session.displayName,local_password:session.localPassword,auth_method:session.authMethod,login:session.login,role:session.role,password_change_required:session.passwordChangeRequired,expires_at:session.expiresAt.toISOString(),access:accessView(session)};
  });
}

export async function logout(db: Kysely<Database>, cookie: string | undefined,
  clock: () => Date, correlationId: string): Promise<void> {
  if (!cookie) return;
  try {
    await db.transaction().execute(async (trx) => {
      const context = await authorize(trx, cookie, clock,true);
      await completeAuthorization(trx, context, context.at);
      await trx.deleteFrom("operator_sessions").where("id", "=", context.sessionId).execute();
      await audit(trx, { action: "operator.logout", actorKind: "operator",
        operatorId: context.operatorId, at: context.at, correlationId });
    });
  } catch (error) {
    if (error instanceof AppError && error.status === 401) return;
    throw error;
  }
}

export async function issueSession(trx:Transaction<Database>,op:Pick<Selectable<Operators>,"id"|"auth_version">,at:Date,lifetime=28800000,identity:string|null=null){
 const sessions=await trx.selectFrom('operator_sessions').selectAll().where('operator_id','=',op.id).orderBy('issued_at').orderBy('id').execute();
 const live=[];for(const s of sessions){if(at<s.issued_at||at>=s.expires_at||at.getTime()-s.last_seen_at.getTime()>=1800000)await trx.deleteFrom('operator_sessions').where('id','=',s.id).execute();else live.push(s);}
 if(live.length>=5)await trx.deleteFrom('operator_sessions').where('id','=',live[0]!.id).execute();
 const session=newCredential('session');await trx.insertInto('operator_sessions').values({id:session.id,operator_id:op.id,secret_digest:session.digest,auth_version:op.auth_version,issued_at:at,last_seen_at:at,expires_at:new Date(at.getTime()+lifetime),auth_method:identity?'oidc':'local',external_identity_id:identity}).execute();return session.value;
}
