import { randomUUID } from "node:crypto";
import { sql, type Kysely, type Transaction } from "kysely";
import type { Database } from "../db/types";
import { audit } from "../access/audit";
import { retentionDays, retentionBatchSize } from "../skills/results/retention-policy";

export async function previewHistoryExpiry(trx: Transaction<Database>, cutoff: Date) {
  const events = await trx.selectFrom("history_events").select("id").where("observed_at", "<", cutoff)
    .orderBy("observed_at").orderBy("id").limit(retentionBatchSize + 1).execute();
  const cursors = await trx.selectFrom("history_subjects").select("id").where("last_sample_at", "<", cutoff)
    .where("facts", "is not", null).orderBy("last_sample_at").orderBy("id").limit(retentionBatchSize + 1).execute();
  return { events: Math.min(events.length, retentionBatchSize),
    cursors: Math.min(cursors.length, Math.max(0, retentionBatchSize - events.length)),
    more: events.length + cursors.length > retentionBatchSize };
}
export async function pruneHistoryBatch(db: Kysely<Database>, cutoff: Date, at: Date) {
  return db.transaction().execute(async (trx) => {
    await sql`SET LOCAL statement_timeout='5s'`.execute(trx);
    await sql`SET LOCAL transaction_timeout='5s'`.execute(trx);
    await sql`SET LOCAL lock_timeout='250ms'`.execute(trx);
    const events = await trx.selectFrom("history_events").select("id").where("observed_at", "<", cutoff)
      .orderBy("observed_at").orderBy("id").limit(retentionBatchSize).forUpdate().execute();
    const remaining = retentionBatchSize - events.length;
    const cursors = remaining ? await trx.selectFrom("history_subjects").select("id").where("last_sample_at", "<", cutoff)
      .where("facts", "is not", null).orderBy("last_sample_at").orderBy("id").limit(remaining).forUpdate().execute() : [];
    if (events.length) {
      const deleted = await trx.deleteFrom("history_events").where("id", "in", events.map((row) => row.id))
        .where("observed_at", "<", cutoff).returning("id").execute();
      if (deleted.length !== events.length) throw new Error("history_prune_count_mismatch");
    }
    if (cursors.length) {
      const updated = await trx.updateTable("history_subjects").set({ facts: null, continuous_since: null, suspended: true, measured_at: null })
        .where("id", "in", cursors.map((row) => row.id)).where("last_sample_at", "<", cutoff).returning("id").execute();
      if (updated.length !== cursors.length) throw new Error("history_prune_count_mismatch");
    }
    const parents = events.length + cursors.length;
    if (parents) await audit(trx, { action: "observation.retention_pruned", actorKind: "system", at,
      correlationId: randomUUID(), retentionFamily: "history", retentionCutoff: cutoff,
      retentionDays, retentionParentCount: parents, retentionMountCount: 0 });
    return { parents, events: events.length, cursors: cursors.length };
  });
}
