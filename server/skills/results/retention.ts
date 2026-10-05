import { randomUUID } from "node:crypto";
import { sql, type Kysely, type Transaction } from "kysely";
import { audit } from "../../access/audit";
import type { Database } from "../../db/types";
import { lockedDefinition } from "../settings/disk";
import { lockBaselineDefinitions } from "../legacy/shared/locks";
import { receiptColumns, type RunFamily } from "./receipts";
import { retentionDays, retentionBatchSize } from "./retention-policy";

export async function previewObservations(trx: Transaction<Database>, family: RunFamily, cutoff: Date) {
  const table = family === "disk" ? "disk_runs" : "baseline_runs";
  const rows = await trx.selectFrom(table).select("id").where("received_at", "<", cutoff)
    .orderBy("received_at").orderBy("id").limit(retentionBatchSize + 1).execute();
  const selected = rows.slice(0, retentionBatchSize);
  const mounts = family === "disk" && selected.length ? await trx.selectFrom("disk_run_mounts")
    .select(({ fn }) => fn.countAll<string>().as("n")).where("run_id", "in", selected.map((r) => r.id))
    .executeTakeFirstOrThrow() : { n: "0" };
  return { parents: selected.length, mounts: Number(mounts.n), more: rows.length > retentionBatchSize };
}
export async function pruneObservationBatch(db: Kysely<Database>, family: RunFamily, cutoff: Date, at: Date) {
  return db.transaction().execute(async (trx) => {
    await sql`SET LOCAL statement_timeout='5s'`.execute(trx);
    await sql`SET LOCAL transaction_timeout='5s'`.execute(trx);
    await sql`SET LOCAL lock_timeout='250ms'`.execute(trx);
    if (family === "disk") await lockedDefinition(trx, true);
    else await lockBaselineDefinitions(trx, "all");
    const table = family === "disk" ? "disk_runs" : "baseline_runs";
    const receipts = family === "disk" ? "disk_run_receipts" : "baseline_run_receipts";
    const columns = family === "disk" ? receiptColumns : [...receiptColumns, "definition_key"] as const;
    const rows = await trx.selectFrom(table).select(columns).where("received_at", "<", cutoff)
      .orderBy("received_at").orderBy("id").limit(retentionBatchSize).forUpdate().execute();
    if (!rows.length) return { parents: 0, mounts: 0 };
    const ids = rows.map((r) => r.id);
    // A conflicting receipt aborts rather than accepting partial or corrupt history.
    const inserted = await trx.insertInto(receipts).values(rows).returning("id").execute();
    const mounts = family === "disk" ? await trx.deleteFrom("disk_run_mounts")
      .where("run_id", "in", ids).executeTakeFirst() : { numDeletedRows: 0n };
    const deleted = await trx.deleteFrom(table).where("id", "in", ids)
      .where("received_at", "<", cutoff).returning("id").execute();
    if (inserted.length !== rows.length || deleted.length !== rows.length) throw new Error("retention_count_mismatch");
    await audit(trx, { action: "observation.retention_pruned", actorKind: "system", at,
      correlationId: randomUUID(), retentionFamily: family, retentionCutoff: cutoff,
      retentionDays, retentionParentCount: rows.length, retentionMountCount: Number(mounts.numDeletedRows) });
    return { parents: rows.length, mounts: Number(mounts.numDeletedRows) };
  });
}
