import type { Kysely, Transaction } from "kysely";
import type { Database } from "../db/types";
import { AppError, fail } from "../errors";
import { ms, parseCredential, sameDigest } from "../validation";
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
  login:string; role:Role; accessRevision:string; passwordChangeRequired:boolean;
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
  const passwordChangeRequired=credential?.must_change_password??false;
  if(passwordChangeRequired&&!restricted)fail("password_change_required",403);
  const context={login:operator.login,role:operator.role,accessRevision,passwordChangeRequired, operatorId: operator.id, sessionId: session.id, expiresAt: session.expires_at,
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
  clock: () => Date): Promise<{login:string;role:Role;password_change_required:boolean;expires_at:string;access:{account_id:string;revision:string}}> {
  return db.transaction().execute(async (trx) => {
    const session = await authorize(trx, cookie, clock,true);
    await completeAuthorization(trx, session, session.at);
    return {login:session.login,role:session.role,password_change_required:session.passwordChangeRequired,expires_at:session.expiresAt.toISOString(),access:accessView(session)};
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
