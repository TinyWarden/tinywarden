import type { Kysely } from "kysely";
import type { Database } from "../db/types";
import { fail } from "../errors";
import { ascii, fingerprint, sameDigest } from "../validation";
import type { Clock } from "../access/operator";
import { authorizeAgent } from "./agent-authority";

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
  const fp = fingerprint([1, input.sequence, input.sentAt.toISOString(), input.agentVersion]);
  return db.transaction().execute(async (trx) => {
    const { agent, credential, now } = await authorizeAgent(trx, rawCredential, clock);
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
