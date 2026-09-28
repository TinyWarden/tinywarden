import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "../db/types";
import { audit } from "../access/audit";
import type { Clock } from "../access/operator";
import type { AppConfig } from "../config";
import { AppError, fail, isPgError } from "../errors";
import { ascii, fingerprint, ms, parseCredential, sameDigest, uuid } from "../validation";

export interface EnrollmentInput {
  requestId: string; credential: string; hostname: string; osId: string;
  osVersion: string; architecture: string; agentVersion: string;
}

export function enrollmentInput(value: Record<string, unknown>): EnrollmentInput {
  let credential: string;
  try { credential = parseCredential("agent", value.credential).value; }
  catch (error) {
    if (error instanceof AppError && error.status === 401) fail("invalid_request", 400);
    throw error;
  }
  return {
    requestId: uuid(value.request_id), credential,
    hostname: ascii(value.hostname, /^[A-Za-z0-9.-]+$/, 1, 253),
    osId: ascii(value.os_id, /^[a-z0-9_-]+$/, 1, 32),
    osVersion: ascii(value.os_version, /^[\x20-\x7e]+$/, 1, 64),
    architecture: ascii(value.architecture, /^[A-Za-z0-9_-]+$/, 1, 32),
    agentVersion: ascii(value.agent_version, /^[A-Za-z0-9.+-]+$/, 1, 64),
  };
}

export interface EnrollmentResult {
  host_id: string; agent_id: string; credential_id: string; generation: number;
  heartbeat_interval_seconds: number; stale_after_seconds: number; duplicate: boolean;
}

export async function enroll(db: Kysely<Database>, rawToken: string,
  input: EnrollmentInput, config: AppConfig, clock: Clock,
  correlationId: string = randomUUID()): Promise<EnrollmentResult> {
  const tokenAuth = parseCredential("enrollment", rawToken);
  const credential = parseCredential("agent", input.credential);
  const fp = fingerprint([1, input.requestId, credential.digest.toString("hex"),
    input.hostname, input.osId, input.osVersion, input.architecture, input.agentVersion]);
  try {
    return await db.transaction().execute(async (trx) => {
      const token = await trx.selectFrom("enrollment_tokens").selectAll()
        .where("id", "=", tokenAuth.id).forUpdate().executeTakeFirst();
      if (!token || !sameDigest(token.secret_digest, tokenAuth.digest) || token.revoked_at) {
        fail("unauthorized", 401);
      }
      if (token.consumed_at) {
        if (token.consumed_request_id !== input.requestId || !token.consumed_fingerprint ||
            !sameDigest(token.consumed_fingerprint, fp)) fail("enrollment_conflict", 409);
        if (!token.consumed_credential_id) fail("unauthorized", 401);
        const seen = await trx.selectFrom("agent_credentials").select(["agent_id"])
          .where("id", "=", token.consumed_credential_id).executeTakeFirst();
        if (!seen) fail("unauthorized", 401);
        const agentRef = await trx.selectFrom("agents").select(["host_id"])
          .where("id", "=", seen.agent_id).executeTakeFirst();
        if (!agentRef) fail("unauthorized", 401);
        const host = await trx.selectFrom("hosts").select("id")
          .where("id", "=", agentRef.host_id).forUpdate().executeTakeFirst();
        const agent = await trx.selectFrom("agents").selectAll()
          .where("id", "=", seen.agent_id).forUpdate().executeTakeFirst();
        const current = await trx.selectFrom("agent_credentials").selectAll()
          .where("id", "=", token.consumed_credential_id).forUpdate().executeTakeFirst();
        const now = ms(clock());
        if (!host || !agent || !current || agent.revoked_at || current.revoked_at ||
            current.agent_id !== agent.id || agent.host_id !== host.id ||
            current.id !== credential.id || !sameDigest(current.secret_digest, credential.digest) ||
            (token.target_agent_id !== null && token.target_agent_id !== agent.id) ||
            current.generation !== agent.current_generation || now < token.issued_at ||
            now < token.consumed_at || now < current.created_at ||
            now.getTime() - token.consumed_at.getTime() >= 24 * 60 * 60_000) {
          fail("unauthorized", 401);
        }
        return { host_id: host.id, agent_id: agent.id, credential_id: current.id,
          generation: Number(current.generation),
          heartbeat_interval_seconds: agent.heartbeat_interval_seconds,
          stale_after_seconds: agent.stale_after_seconds, duplicate: true };
      }
      const now = ms(clock());
      if (now < token.issued_at || now >= token.expires_at) fail("unauthorized", 401);
      const reusedId = await trx.selectFrom("enrollment_tokens").select("id")
        .where("consumed_request_id", "=", input.requestId).executeTakeFirst();
      if (reusedId) fail("enrollment_conflict", 409);
      const existingCredential = await trx.selectFrom("agent_credentials").select("id")
        .where("id", "=", credential.id).executeTakeFirst();
      if (existingCredential) fail("credential_conflict", 409);
      if (token.target_agent_id !== null) {
        const reference = await trx.selectFrom("agents").select("host_id")
          .where("id", "=", token.target_agent_id).executeTakeFirst();
        if (!reference) fail("unauthorized", 401);
        const host = await trx.selectFrom("hosts").select(["id", "label"])
          .where("id", "=", reference.host_id).forUpdate().executeTakeFirst();
        const agent = await trx.selectFrom("agents").selectAll()
          .where("id", "=", token.target_agent_id).forUpdate().executeTakeFirst();
        if (!host || !agent || agent.host_id !== host.id || agent.revoked_at ||
            token.label !== host.label) fail("unauthorized", 401);
        const fromGeneration = Number(agent.current_generation);
        if (fromGeneration !== Number(token.expected_generation)) fail("generation_changed", 409);
        if (fromGeneration >= Number.MAX_SAFE_INTEGER) fail("generation_exhausted", 409);
        const previous = await trx.selectFrom("agent_credentials").selectAll()
          .where("agent_id", "=", agent.id).where("generation", "=", String(fromGeneration))
          .where("revoked_at", "is", null).forUpdate().executeTakeFirst();
        const committedAt = ms(clock());
        if (!previous || committedAt < token.issued_at || committedAt >= token.expires_at ||
            committedAt < agent.enrolled_at || committedAt < previous.created_at) {
          fail("unauthorized", 401);
        }
        const nextGeneration = fromGeneration + 1;
        await trx.updateTable("agent_credentials").set({ revoked_at: committedAt })
          .where("id", "=", previous.id).execute();
        await trx.updateTable("agents").set({ current_generation: nextGeneration })
          .where("id", "=", agent.id).execute();
        await trx.insertInto("agent_credentials").values({ id: credential.id,
          agent_id: agent.id, generation: nextGeneration, secret_digest: credential.digest,
          created_at: committedAt, revoked_at: null, last_sequence: 0, last_fingerprint: null,
          accepted_at: null, sent_at: null, agent_version: null }).execute();
        await trx.updateTable("enrollment_tokens").set({ consumed_at: committedAt,
          consumed_request_id: input.requestId, consumed_fingerprint: fp,
          consumed_credential_id: credential.id }).where("id", "=", token.id).execute();
        await audit(trx, { action: "agent.credential_replaced", actorKind: "agent",
          agentId: agent.id, targetAgentId: agent.id, hostId: host.id,
          tokenId: token.id, at: committedAt, correlationId,
          fromGeneration, toGeneration: nextGeneration });
        return { host_id: host.id, agent_id: agent.id, credential_id: credential.id,
          generation: nextGeneration,
          heartbeat_interval_seconds: agent.heartbeat_interval_seconds,
          stale_after_seconds: agent.stale_after_seconds, duplicate: false };
      }
      const hostId = randomUUID();
      const agentId = randomUUID();
      await trx.insertInto("hosts").values({ id: hostId, label: token.label,
        reported_hostname: input.hostname, os_id: input.osId,
        os_version: input.osVersion, architecture: input.architecture,
        enrolled_agent_version: input.agentVersion, created_at: now }).execute();
      await trx.insertInto("agents").values({ id: agentId, host_id: hostId,
        current_generation: 1, enrolled_at: now, revoked_at: null,
        heartbeat_interval_seconds: config.heartbeatIntervalSeconds,
        stale_after_seconds: config.staleAfterSeconds }).execute();
      await trx.insertInto("agent_credentials").values({ id: credential.id,
        agent_id: agentId, generation: 1, secret_digest: credential.digest,
        created_at: now, revoked_at: null, last_sequence: 0,
        last_fingerprint: null, accepted_at: null, sent_at: null,
        agent_version: null }).execute();
      await trx.updateTable("enrollment_tokens").set({ consumed_at: now,
        consumed_request_id: input.requestId, consumed_fingerprint: fp,
        consumed_credential_id: credential.id }).where("id", "=", token.id).execute();
      await audit(trx, { action: "agent.enrolled", actorKind: "agent", agentId,
        targetAgentId: agentId, hostId, tokenId: token.id, at: now, correlationId });
      return { host_id: hostId, agent_id: agentId, credential_id: credential.id,
        generation: 1, heartbeat_interval_seconds: config.heartbeatIntervalSeconds,
        stale_after_seconds: config.staleAfterSeconds, duplicate: false };
    });
  } catch (error) {
    if (isPgError(error, "23505", "enrollment_tokens_consumed_request_id_key")) {
      fail("enrollment_conflict", 409);
    }
    if (isPgError(error, "23505", "agent_credentials_pkey") ||
        isPgError(error, "23505", "agent_credentials_secret_digest_key")) {
      fail("credential_conflict", 409);
    }
    throw error;
  }
}
