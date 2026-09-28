import type { Kysely } from "kysely";
import type { Database } from "../db/types";
import { fail } from "../errors";
import { ascii, fingerprint, ms, parseCredential, sameDigest } from "../validation";
import type { Clock } from "../access/operator";

export interface HeartbeatInput { sequence: number; sentAt: Date; agentVersion: string }

export function heartbeatInput(value: Record<string, unknown>): HeartbeatInput {
  const sequence = value.sequence;
  if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) ||
      sequence < 1 || sequence > Number.MAX_SAFE_INTEGER) fail("invalid_request", 400);
  const rawTime = value.sent_at;
  if (typeof rawTime !== "string" ||
      !/^\d{4}-(0[1-9]|1[0-2])-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(rawTime)) {
    fail("invalid_request", 400);
  }
  const sentAt = new Date(rawTime);
  if (Number.isNaN(sentAt.getTime()) || sentAt.getUTCFullYear() < 1 ||
      sentAt.toISOString() !== rawTime) {
    fail("invalid_request", 400);
  }
  return { sequence, sentAt,
    agentVersion: ascii(value.agent_version, /^[A-Za-z0-9.+-]+$/, 1, 64) };
}

export async function heartbeat(db: Kysely<Database>, rawCredential: string,
  input: HeartbeatInput, clock: Clock): Promise<{ sequence: number; accepted_at: string;
    duplicate: boolean; heartbeat_interval_seconds: number; stale_after_seconds: number }> {
  const auth = parseCredential("agent", rawCredential);
  const fp = fingerprint([1, input.sequence, input.sentAt.toISOString(), input.agentVersion]);
  return db.transaction().execute(async (trx) => {
    const reference = await trx.selectFrom("agent_credentials").select("agent_id")
      .where("id", "=", auth.id).executeTakeFirst();
    if (!reference) fail("unauthorized", 401);
    const agentRef = await trx.selectFrom("agents").select("host_id")
      .where("id", "=", reference.agent_id).executeTakeFirst();
    if (!agentRef) fail("unauthorized", 401);
    const host = await trx.selectFrom("hosts").select("id")
      .where("id", "=", agentRef.host_id).forUpdate().executeTakeFirst();
    const agent = await trx.selectFrom("agents").selectAll()
      .where("id", "=", reference.agent_id).forUpdate().executeTakeFirst();
    const credential = await trx.selectFrom("agent_credentials").selectAll()
      .where("id", "=", auth.id).forUpdate().executeTakeFirst();
    if (!host || !agent || !credential || agent.host_id !== host.id ||
        credential.agent_id !== agent.id || agent.revoked_at || credential.revoked_at ||
        credential.generation !== agent.current_generation ||
        !sameDigest(credential.secret_digest, auth.digest)) fail("unauthorized", 401);
    const now = ms(clock());
    if (now < credential.created_at || now < agent.enrolled_at) fail("unauthorized", 401);
    const previous = Number(credential.last_sequence);
    if (input.sequence < previous) fail("sequence_superseded", 409);
    if (input.sequence === previous) {
      if (!credential.last_fingerprint || !credential.accepted_at ||
          !sameDigest(credential.last_fingerprint, fp)) fail("sequence_conflict", 409);
      return { sequence: input.sequence, accepted_at: credential.accepted_at.toISOString(),
        duplicate: true, heartbeat_interval_seconds: agent.heartbeat_interval_seconds,
        stale_after_seconds: agent.stale_after_seconds };
    }
    const accepted = credential.accepted_at && credential.accepted_at > now
      ? credential.accepted_at : now;
    await trx.updateTable("agent_credentials").set({ last_sequence: input.sequence,
      last_fingerprint: fp, accepted_at: accepted, sent_at: input.sentAt,
      agent_version: input.agentVersion }).where("id", "=", credential.id).execute();
    return { sequence: input.sequence, accepted_at: accepted.toISOString(),
      duplicate: false, heartbeat_interval_seconds: agent.heartbeat_interval_seconds,
      stale_after_seconds: agent.stale_after_seconds };
  });
}
