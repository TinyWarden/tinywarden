import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "../db/types";
import { AppError, fail } from "../errors";
import { fingerprint, label, ms, newCredential, uuid } from "../validation";
import { audit } from "../access/audit";
import { authorize, completeAuthorization } from "../access/session";
import type { Clock } from "../access/operator";

export interface IssueTokenInput { requestId: string; label: string; targetAgentId: string | null }
export function issueInput(value: Record<string, unknown>): IssueTokenInput {
  return { requestId: uuid(value.request_id), label: label(value.label),
    targetAgentId: value.target_agent_id === null ? null : uuid(value.target_agent_id) };
}

export async function issueToken(db: Kysely<Database>, cookie: string,
  input: IssueTokenInput, clock: Clock, correlationId: string = randomUUID()):
Promise<{ token_id: string; token: string; expires_at: string }> {
  return db.transaction().execute(async (trx) => {
    const actor = await authorize(trx, cookie, clock);
    const fp = fingerprint([1, input.requestId, input.label, input.targetAgentId]);
    const existing = await trx.selectFrom("enrollment_tokens").selectAll()
      .where("issued_by", "=", actor.operatorId)
      .where("issuance_request_id", "=", input.requestId).executeTakeFirst();
    if (existing) {
      await completeAuthorization(trx, actor, clock());
      if (!existing.issuance_fingerprint.equals(fp)) fail("issuance_conflict", 409);
      throw new AppError("token_already_issued", 409, undefined, existing.id);
    }
    let expectedGeneration: number | null = null;
    if (input.targetAgentId) {
      const reference = await trx.selectFrom("agents").select("host_id")
        .where("id", "=", input.targetAgentId).executeTakeFirst();
      if (!reference) fail("not_found", 404);
      const host = await trx.selectFrom("hosts").select(["id", "label"])
        .where("id", "=", reference.host_id).forUpdate().executeTakeFirst();
      const agent = await trx.selectFrom("agents").selectAll()
        .where("id", "=", input.targetAgentId).forUpdate().executeTakeFirst();
      if (!host || !agent || agent.host_id !== host.id || agent.revoked_at ||
          input.label !== host.label) fail("agent_unavailable", 409);
      expectedGeneration = Number(agent.current_generation);
      if (expectedGeneration >= Number.MAX_SAFE_INTEGER) fail("generation_exhausted", 409);
      const current = await trx.selectFrom("agent_credentials").select("id")
        .where("agent_id", "=", agent.id).where("generation", "=", String(expectedGeneration))
        .where("revoked_at", "is", null).forUpdate().executeTakeFirst();
      if (!current) fail("agent_unavailable", 409);
    }
    const now = ms(clock());
    await completeAuthorization(trx, actor, now);
    const count = await trx.selectFrom("enrollment_tokens").select(({ fn }) =>
      fn.count<string>("id").as("total"))
      .where("consumed_at", "is", null).where("revoked_at", "is", null)
      .where("expires_at", ">", now).executeTakeFirstOrThrow();
    if (Number(count.total) >= 20) fail("token_limit", 409);
    const token = newCredential("enrollment");
    const expires = new Date(now.getTime() + 15 * 60_000);
    await trx.insertInto("enrollment_tokens").values({ id: token.id,
      secret_digest: token.digest, issued_by: actor.operatorId,
      issuance_request_id: input.requestId, issuance_fingerprint: fp,
      label: input.label, target_agent_id: input.targetAgentId,
      expected_generation: expectedGeneration,
      issued_at: now, expires_at: expires, revoked_at: null,
      consumed_at: null, consumed_request_id: null, consumed_fingerprint: null,
      consumed_credential_id: null }).execute();
    await audit(trx, { action: "enrollment.issued", actorKind: "operator",
      operatorId: actor.operatorId, tokenId: token.id, at: now, correlationId });
    return { token_id: token.id, token: token.value, expires_at: expires.toISOString() };
  });
}

export async function revokeToken(db: Kysely<Database>, cookie: string, id: string,
  clock: Clock, correlationId: string = randomUUID()): Promise<void> {
  uuid(id);
  await db.transaction().execute(async (trx) => {
    const actor = await authorize(trx, cookie, clock);
    const token = await trx.selectFrom("enrollment_tokens").selectAll()
      .where("id", "=", id).forUpdate().executeTakeFirst();
    if (!token) {
      await completeAuthorization(trx, actor, clock());
      fail("not_found", 404);
    }
    const now = await completeAuthorization(trx, actor, clock());
    if (token.revoked_at !== null) return;
    await trx.updateTable("enrollment_tokens").set({ revoked_at: now })
      .where("id", "=", id).execute();
    await audit(trx, { action: "enrollment.revoked", actorKind: "operator",
      operatorId: actor.operatorId, tokenId: id, at: now,
      correlationId, revoked: true });
  });
}
