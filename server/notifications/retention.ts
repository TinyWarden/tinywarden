import { sql, type Kysely, type Transaction } from "kysely";
import type { Database } from "../db/types";

export async function previewMessageExpiry(trx: Transaction<Database>, cutoff: Date): Promise<number> {
  const rows = await trx.selectFrom("notification_outbox").select("id").where("message_snapshot", "is not", null)
    .where("created_at", "<", cutoff).limit(101).execute();
  return rows.length;
}
/** Clear only bounded prose snapshots, keeping delivery metadata and incident cursors. */
export async function pruneMessageBatch(db: Kysely<Database>, cutoff: Date): Promise<number> {
  const result = await sql`WITH candidates AS (
    SELECT id FROM tinywarden.notification_outbox WHERE message_snapshot IS NOT NULL AND created_at < ${cutoff}
    ORDER BY created_at,id LIMIT 100 FOR UPDATE SKIP LOCKED)
    UPDATE tinywarden.notification_outbox SET message_snapshot=NULL WHERE id IN(SELECT id FROM candidates)`.execute(db);
  return Number(result.numAffectedRows ?? 0);
}
