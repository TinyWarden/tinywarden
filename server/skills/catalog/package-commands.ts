import { randomUUID } from "node:crypto";
import { sql, type Kysely, type Transaction } from "kysely";
import type { Database } from "../../db/types";
import { authorize, completeAuthorization } from "../../access/session";
import { fail } from "../../errors";
import { sameDigest, fingerprint } from "../../validation";

export type PackageDb = Kysely<Database>;
/** Read roots renew session activity; concurrent repeatable-read snapshots can conflict.
 * Retry only a rolled-back serialization/deadlock, never a write or external action. */
export async function packageRead<T>(db:PackageDb,action:(trx:Transaction<Database>)=>Promise<T>):Promise<T>{
  for(let attempt=0;attempt<3;attempt++){
    try{return await db.transaction().setIsolationLevel("repeatable read").execute(action);}
    catch(error){const code=error && typeof error==="object" && "code" in error?error.code:null;
      if(attempt===2 || code!=="40001" && code!=="40P01")throw error;}
  }
  throw new Error("package_read_unavailable");
}
export async function operatorSnapshot(db: PackageDb, cookie: string, clock: () => Date) {
  return db.transaction().execute(async (trx) => {
    const actor = await authorize(trx, cookie, clock);
    await completeAuthorization(trx, actor, clock());
    return actor;
  });
}
export async function packageLock(trx: Transaction<Database>) {
  await sql`SELECT pg_advisory_xact_lock(hashtextextended('tinywarden-package-controls-v1',0))`.execute(trx);
}
export async function installed(db: PackageDb, id: string) {
  const installation = await db.selectFrom("skill_installations").selectAll().where("id", "=", id).executeTakeFirst();
  if (!installation) fail("not_found", 404);
  const artifact = await db.selectFrom("skill_packages").selectAll().where("content_sha256", "=", installation.content_sha256).executeTakeFirst();
  if (!artifact) fail("temporarily_unavailable", 503);
  return { installation, artifact };
}
export function settingsTuple(settings: Record<string, unknown>) {
  return Object.entries(settings).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
}
export function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => [key, canonicalValue(item)]));
  return value;
}
export function canonicalText(value: unknown) { return JSON.stringify(canonicalValue(value)); }
export function commandFingerprint(action: string, ...values: unknown[]) { return fingerprint([1, action, ...values.map(canonicalValue)]); }
export async function mutationReplay(trx: Transaction<Database>, operator: string, request: string, digest: Buffer) {
  const old = await trx.selectFrom("skill_package_mutations").selectAll().where("operator_id", "=", operator).where("request_id", "=", request).executeTakeFirst();
  if (old && !sameDigest(old.fingerprint, digest)) fail("idempotency_conflict", 409);
  return old?.result;
}
export async function authorizedReplay(db: PackageDb, cookie: string, request: string, digest: Buffer, clock: () => Date) {
  return db.transaction().execute(async (trx) => {
    const actor = await authorize(trx, cookie, clock);
    await completeAuthorization(trx, actor, clock());
    return mutationReplay(trx, actor.operatorId, request, digest);
  });
}
export async function recordMutation(trx: Transaction<Database>, operator: string, request: string,
  action: string, installation: string, digest: Buffer, at: Date, result: unknown) {
  await trx.insertInto("skill_package_mutations").values({ operator_id: operator, request_id: request,
    action, installation_id: installation, fingerprint: digest, completed_at: at, result }).execute();
}
export function nextCounter(value: string) {
  const number = Number(value) + 1;
  if (!Number.isSafeInteger(number)) fail("version_exhausted", 409);
  return String(number);
}
export const newInstallationId = randomUUID;
