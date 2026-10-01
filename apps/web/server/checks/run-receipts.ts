import type { Transaction } from "kysely";
import type { Database } from "../db/types";
import { fail } from "../errors";
import { sameDigest } from "../validation";

export type RunFamily = "disk" | "baseline";
export const receiptColumns = ["id", "host_id", "agent_id", "generation", "run_sequence",
  "assignment_id", "received_at", "request_digest"] as const;

// Definition locks protect the atomic movement between full evidence and receipts.
export async function duplicateRun(trx: Transaction<Database>, family: RunFamily,
  scope: { hostId: string; agentId: string; generation: string },
  input: { run_id: string; run_sequence: number }, digest: Buffer) {
  const runs = family === "disk" ? "disk_runs" : "baseline_runs";
  const receipts = family === "disk" ? "disk_run_receipts" : "baseline_run_receipts";
  const all = () => trx.selectFrom(runs).select(receiptColumns)
    .unionAll(trx.selectFrom(receipts).select(receiptColumns));
  const byId = await trx.selectFrom(all().as("r")).selectAll()
    .where("id", "=", input.run_id).limit(2).execute();
  const bySequence = await trx.selectFrom(all().as("r")).selectAll()
    .where("agent_id", "=", scope.agentId).where("generation", "=", scope.generation)
    .where("run_sequence", "=", String(input.run_sequence)).limit(2).execute();
  if (!byId.length && !bySequence.length) return null;
  const row = byId[0];
  if (byId.length !== 1 || bySequence.length !== 1 || !row || row.id !== bySequence[0]!.id ||
      row.host_id !== scope.hostId || row.agent_id !== scope.agentId ||
      row.generation !== scope.generation || !sameDigest(row.request_digest, digest)) fail("run_conflict", 409);
  return { run_id: row.id, run_sequence: Number(row.run_sequence),
    received_at: row.received_at.toISOString(), duplicate: true };
}
