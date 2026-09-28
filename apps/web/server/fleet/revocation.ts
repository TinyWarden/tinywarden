import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "../db/types";
import { audit } from "../access/audit";
import { authorize, completeAuthorization } from "../access/session";
import type { Clock } from "../access/operator";
import { fail } from "../errors";
import { uuid } from "../validation";

export async function revokeAgent(db: Kysely<Database>, cookie: string, rawId: string,
  clock: Clock, correlationId: string = randomUUID()): Promise<void> {
  const id = uuid(rawId);
  await db.transaction().execute(async (trx) => {
    const actor = await authorize(trx, cookie, clock);
    const reference = await trx.selectFrom("agents").select("host_id")
      .where("id", "=", id).executeTakeFirst();
    if (!reference) {
      await completeAuthorization(trx, actor, clock());
      fail("not_found", 404);
    }
    const host = await trx.selectFrom("hosts").select("id")
      .where("id", "=", reference.host_id).forUpdate().executeTakeFirst();
    const agent = await trx.selectFrom("agents").selectAll()
      .where("id", "=", id).forUpdate().executeTakeFirst();
    if (!host || !agent || agent.host_id !== host.id) {
      await completeAuthorization(trx, actor, clock());
      fail("not_found", 404);
    }
    if (agent.revoked_at) {
      await completeAuthorization(trx, actor, clock());
      return;
    }
    const credentials = await trx.selectFrom("agent_credentials").select(["id", "created_at"])
      .where("agent_id", "=", id).where("revoked_at", "is", null)
      .orderBy("id", "asc").forUpdate().execute();
    const now = await completeAuthorization(trx, actor, clock());
    if (credentials.length !== 1) fail("temporarily_unavailable", 503);
    if (now < agent.enrolled_at || now < credentials[0]!.created_at) {
      fail("temporarily_unavailable", 503);
    }
    await trx.updateTable("agent_credentials").set({ revoked_at: now })
      .where("id", "=", credentials[0]!.id).execute();
    await trx.updateTable("agents").set({ revoked_at: now }).where("id", "=", id).execute();
    await audit(trx, { action: "agent.revoked", actorKind: "operator",
      operatorId: actor.operatorId, targetAgentId: id, hostId: host.id,
      at: now, correlationId, revoked: true });
  });
}
