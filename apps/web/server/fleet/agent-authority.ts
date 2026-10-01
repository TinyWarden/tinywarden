import type { Transaction } from "kysely";
import type { Database } from "../db/types";
import { fail } from "../errors";
import { ms, parseCredential, sameDigest } from "../validation";

export async function authorizeAgent(trx: Transaction<Database>, rawCredential: string,
  clock: () => Date) {
  const auth = parseCredential("agent", rawCredential);
  const reference = await trx.selectFrom("agent_credentials").select("agent_id")
    .where("id", "=", auth.id).executeTakeFirst();
  if (!reference) fail("unauthorized", 401);
  const agentRef = await trx.selectFrom("agents").select("host_id")
    .where("id", "=", reference.agent_id).executeTakeFirst();
  if (!agentRef) fail("unauthorized", 401);
  const host = await trx.selectFrom("hosts").selectAll()
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
  if (now < credential.created_at || now < agent.enrolled_at || now < host.created_at) {
    fail("unauthorized", 401);
  }
  return { host, agent, credential, now };
}
