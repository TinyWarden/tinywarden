import { agentContactAt } from "../../fleet/contact-evidence";
import type { Selectable, Transaction } from "kysely";
import type { Database, Hosts } from "../../db/types";
import { contactState } from "../../fleet/contact";
import { packageProjections } from "./package-projection";

// One bounded set of queries per batch under the caller's MVCC snapshot.
export async function fleetEvidence(trx: Transaction<Database>, hosts: Selectable<Hosts>[], at: Date) {
  if (!hosts.length || hosts.length > 50) throw new Error("invalid_fleet_batch");
  const ids = hosts.map((host) => host.id);
  const packages = await packageProjections(trx, ids, at);
  const agents = await trx.selectFrom("agents").selectAll().where("host_id", "in", ids).execute();
  const credentials = await trx.selectFrom("agent_credentials as c").innerJoin("agents as a", "a.id", "c.agent_id")
    .selectAll("c").where("a.host_id", "in", ids).whereRef("c.generation", "=", "a.current_generation").execute();
  return hosts.map((host) => {
    const agent = agents.find((row) => row.host_id === host.id), credential = credentials.find((row) => row.agent_id === agent?.id);
    const contactAt = credential?.revoked_at ? null : agentContactAt(credential);
    const contact = contactState(agent?.revoked_at ?? null, contactAt, agent?.stale_after_seconds ?? 0, at);
    const scope = { host_id: host.id, agent_id: agent?.id ?? null, generation: agent?.current_generation ?? null,
      eligible: host.lifecycle==="active" && !!agent && !!credential && !agent.revoked_at && !credential.revoked_at, as_of: at.toISOString() };
    const contactCheck = { ...scope, key: "contact" as const, state: contact === "current" ? "healthy" as const
      : contact === "stale" ? "offline" as const : "unknown" as const, reason: contact,
      source_revision: "0", policy_version: "0", assessment_version: null, current_assignment_id: null,
      valid_until: contact === "current" ? new Date(contactAt!.getTime() + agent!.stale_after_seconds * 1000).toISOString() : null };
    return { host, agent, credential: credential ? { agent_version: credential.agent_version, last_contact_at: contactAt } : null,
      contact, contact_check: contactCheck, packages: packages.filter((p) => p.host_id === host.id) };
  });
}
export type FleetEvidence = Awaited<ReturnType<typeof fleetEvidence>>[number];
