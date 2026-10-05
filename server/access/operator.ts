import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "../db/types";
import { AppError, fail, isPgError } from "../errors";
import { ms, newCredential, password, sameDigest } from "../validation";
import { audit } from "./audit";
import { hashPassword, verifyPassword } from "./password";

export type Clock = () => Date;

export async function initOperator(db: Kysely<Database>, rawPassword: unknown,
  clock: Clock, correlationId: string = randomUUID()): Promise<void> {
  const secret = password(rawPassword);
  const hashed = await hashPassword(secret);
  try {
    await db.transaction().execute(async (trx) => {
      const now = ms(clock());
      const operatorId = randomUUID();
      await trx.insertInto("operators").values({ id: operatorId, singleton: true,
        login: "admin", password_algorithm: "scrypt-v1", password_n: 131072,
        password_r: 8, password_p: 1, password_salt: hashed.salt,
        password_hash: hashed.hash, auth_version: 1, created_at: now,
        password_changed_at: now }).execute();
      await audit(trx, { action: "operator.initialized", actorKind: "system",
        targetOperatorId: operatorId, at: now, correlationId });
    });
  } catch (error) {
    if (isPgError(error, "23505")) throw new AppError("operator_exists", 409);
    throw error;
  }
}

export async function resetPassword(db: Kysely<Database>, rawPassword: unknown,
  clock: Clock, correlationId: string = randomUUID()): Promise<void> {
  const old = await db.selectFrom("operators").select(["id", "auth_version"])
    .where("singleton", "=", true).executeTakeFirst();
  if (!old) fail("setup_required", 503);
  const hashed = await hashPassword(rawPassword);
  await db.transaction().execute(async (trx) => {
    const operator = await trx.selectFrom("operators").selectAll()
      .where("id", "=", old.id).forUpdate().executeTakeFirst();
    if (!operator || operator.auth_version !== old.auth_version) fail("operator_changed", 409);
    const nextVersion = Number(operator.auth_version) + 1;
    if (!Number.isSafeInteger(nextVersion)) fail("operator_changed", 409);
    const now = ms(clock());
    await trx.updateTable("operators").set({ password_salt: hashed.salt,
      password_hash: hashed.hash, auth_version: nextVersion,
      password_changed_at: now }).where("id", "=", operator.id).execute();
    await trx.deleteFrom("operator_sessions").where("operator_id", "=", operator.id).execute();
    await audit(trx, { action: "operator.password_reset", actorKind: "system",
      targetOperatorId: operator.id, at: now, correlationId });
  });
}

async function reserveLoginAttempt(db: Kysely<Database>, clock: Clock): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const initial = ms(clock());
    await trx.insertInto("login_throttle").values({ singleton: true,
      window_started_at: initial, attempts: 0 })
      .onConflict((oc) => oc.column("singleton").doNothing()).execute();
    const row = await trx.selectFrom("login_throttle").selectAll()
      .where("singleton", "=", true).forUpdate().executeTakeFirstOrThrow();
    const now = ms(clock());
    const elapsed = now.getTime() - row.window_started_at.getTime();
    const restart = elapsed >= 60_000;
    if (!restart && row.attempts >= 5) throw new AppError("rate_limited", 429,
      Math.max(1, Math.ceil((60_000 - Math.max(0, elapsed)) / 1000)));
    await trx.updateTable("login_throttle").set({ attempts: restart ? 1 : row.attempts + 1,
      window_started_at: restart ? now : row.window_started_at })
      .where("singleton", "=", true).execute();
  });
}

export async function login(db: Kysely<Database>, name: unknown, rawPassword: unknown,
  clock: Clock, correlationId: string = randomUUID()): Promise<string> {
  if (typeof name !== "string" || name.length < 1 || name.length > 64 ||
      !/^[\x21-\x7e]+$/.test(name)) fail("invalid_request", 400);
  password(rawPassword);
  const old = await db.selectFrom("operators").selectAll()
    .where("singleton", "=", true).executeTakeFirst();
  if (!old) fail("setup_required", 503);
  await reserveLoginAttempt(db, clock);
  const matched = await verifyPassword(rawPassword, old);
  return db.transaction().execute(async (trx) => {
    const operator = await trx.selectFrom("operators").selectAll()
      .where("id", "=", old.id).forUpdate().executeTakeFirst();
    if (!operator || operator.auth_version !== old.auth_version) fail("unauthorized", 401);
    if (!matched || name !== "admin" || !sameDigest(operator.password_hash, old.password_hash)) {
      fail("unauthorized", 401);
    }
    const now = ms(clock());
    if (now < operator.created_at) fail("unauthorized", 401);
    const previous = await trx.selectFrom("operator_sessions").selectAll()
      .where("operator_id", "=", operator.id).orderBy("issued_at", "asc")
      .orderBy("id", "asc").execute();
    for (const row of previous) {
      if (now < row.issued_at || now >= row.expires_at ||
          now.getTime() - row.last_seen_at.getTime() >= 30 * 60_000) {
        await trx.deleteFrom("operator_sessions").where("id", "=", row.id).execute();
      }
    }
    const stillActive = previous.filter((row) => now >= row.issued_at &&
      now < row.expires_at && now.getTime() - row.last_seen_at.getTime() < 30 * 60_000);
    if (stillActive.length >= 5) {
      await trx.deleteFrom("operator_sessions").where("id", "=", stillActive[0]!.id).execute();
    }
    const session = newCredential("session");
    await trx.insertInto("operator_sessions").values({ id: session.id,
      operator_id: operator.id, secret_digest: session.digest,
      auth_version: operator.auth_version, issued_at: now,
      last_seen_at: now, expires_at: new Date(now.getTime() + 8 * 60 * 60_000) }).execute();
    await audit(trx, { action: "operator.login", actorKind: "operator",
      operatorId: operator.id, at: now, correlationId });
    return session.value;
  });
}
