import type { Transaction } from "kysely";
import type { Database } from "../db/types";
import type { authorizeAgent } from "./agent-authority";

type ContactEvidence = { accepted_at: Date | null; last_contact_at?: Date | null };
type Authority = Awaited<ReturnType<typeof authorizeAgent>>;

// Older compatible writers may still advance only the heartbeat receipt.
export function agentContactAt(evidence: ContactEvidence | null | undefined): Date | null {
  const receipt = evidence?.accepted_at ?? null, contact = evidence?.last_contact_at ?? null;
  return contact && (!receipt || contact > receipt) ? contact : receipt;
}

export function nextAgentContact(scope: Authority): Date {
  const previous = agentContactAt(scope.credential);
  return previous && previous > scope.now ? previous : scope.now;
}

// Call only on an accepted branch, under the authority locks, in its transaction.
export async function recordAgentContact(trx: Transaction<Database>, scope: Authority) {
  const next = nextAgentContact(scope);
  if (!scope.credential.last_contact_at || next > scope.credential.last_contact_at) {
    await trx.updateTable("agent_credentials").set({ last_contact_at: next })
      .where("id", "=", scope.credential.id).execute();
  }
}
