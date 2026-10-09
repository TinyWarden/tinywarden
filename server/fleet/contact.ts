import { agentContactAt } from "./contact-evidence";
import type { Transaction } from "kysely";
import type { Database } from "../db/types";
import { fail } from "../errors";
import { ms, uuid } from "../validation";

export function contactState(revoked: Date | null, contact: Date | null, grace: number, at: Date) {
  return revoked ? "revoked" : !contact || at < contact ? "unknown"
    : at.getTime() < contact.getTime() + grace * 1000 ? "current" : "stale";
}

export async function contactSummary(trx: Transaction<Database>, rawHostId: string, clock: () => Date) {
  const hostId = uuid(rawHostId);
  const host = await trx.selectFrom("hosts").select("id").where("id", "=", hostId).forShare().executeTakeFirst();
  if (!host) fail("not_found", 404);
  const agent = await trx.selectFrom("agents").selectAll().where("host_id", "=", hostId).forShare().executeTakeFirst();
  const credential = agent ? await trx.selectFrom("agent_credentials").selectAll().where("agent_id", "=", agent.id)
    .where("generation", "=", agent.current_generation).forShare().executeTakeFirst() : null;
  const at = ms(clock()), contact = credential?.revoked_at ? null : agentContactAt(credential);
  const state = contactState(agent?.revoked_at ?? null, contact, agent?.stale_after_seconds ?? 0, at);
  return { host_id: hostId, agent_id: agent?.id ?? null, generation: agent?.current_generation ?? null,
    key: "contact" as const, source_revision: "0", policy_version: "0", assessment_version: null,
    contact_current: state === "current", facts: contact ? { contact_at: contact.toISOString() } : {},
    eligible: !!agent && !!credential && !agent.revoked_at && !credential.revoked_at,
    state: state === "current" ? "healthy" as const : state === "stale" ? "offline" as const : "unknown" as const,
    reason: state, as_of: at.toISOString(), current_assignment_id: null,
    valid_until: state === "current" && contact ? new Date(contact.getTime() + agent!.stale_after_seconds * 1000).toISOString() : null };
}
