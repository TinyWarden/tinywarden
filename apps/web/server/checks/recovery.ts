import type { Transaction } from "kysely";
import type { Database } from "../db/types";

export type RecoveryReason = "assignment_revision_regressed" |
  "assignment_identity_conflict" | "assignment_snapshot_missing";

export async function latchDiskRecovery(trx: Transaction<Database>, hostId: string,
  agentId: string, generation: string, reason: RecoveryReason, at: Date): Promise<void> {
  await trx.insertInto("disk_recovery_latches").values({ host_id: hostId, agent_id: agentId,
    generation, reason, latched_at: at })
    .onConflict((conflict) => conflict.columns(["agent_id", "generation"]).doNothing()).execute();
}
