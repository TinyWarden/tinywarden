import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { sql, type Kysely, type Transaction } from "kysely";
import { audit } from "../access/audit";
import { assertDatabaseTarget } from "../db/target";
import type { Database } from "../db/types";
import { lockedDefinition } from "./policy";
import { lockBaselineDefinitions } from "./baseline-locks";
import { receiptColumns, type RunFamily } from "./run-receipts";
import { retentionDays, retentionCutoff, retentionBatchSize, retentionBatchLimit,
  retentionBudgetMs } from "./retention-policy";

export type RetentionResult = { mode: "dry_run" | "apply"; cutoff: string;
  disk_runs: number; baseline_runs: number; mount_rows: number; batches: number;
  more_eligible: boolean | null; outcome: "complete" | "bounded" | "retryable" | "failed" };
const families = ["disk", "baseline"] as const;
async function requireLedger(db: Kysely<Database>) {
  const names = (await sql<{ name: string }>`SELECT name FROM tinywarden.kysely_migration ORDER BY name`
    .execute(db)).rows.map((r) => r.name);
  if (names.join(",") !== ["001_initial", "002_audit_target_agent", "003_check_definitions",
    "004_disk_runs", "005_disk_recovery_latches", "006_baseline_definitions", "007_baseline_runs",
    "008_observation_retention", "009_notifications"].join(",")) throw new Error("wrong_migration_ledger");
}
async function preview(trx: Transaction<Database>, family: RunFamily, cutoff: Date) {
  const table = family === "disk" ? "disk_runs" : "baseline_runs";
  const rows = await trx.selectFrom(table).select("id").where("received_at", "<", cutoff)
    .orderBy("received_at").orderBy("id").limit(retentionBatchSize + 1).execute();
  const selected = rows.slice(0, retentionBatchSize);
  const mounts = family === "disk" && selected.length ? await trx.selectFrom("disk_run_mounts")
    .select(({ fn }) => fn.countAll<string>().as("n")).where("run_id", "in", selected.map((r) => r.id))
    .executeTakeFirstOrThrow() : { n: "0" };
  return { parents: selected.length, mounts: Number(mounts.n), more: rows.length > retentionBatchSize };
}
async function pruneBatch(db: Kysely<Database>, family: RunFamily, cutoff: Date, at: Date) {
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
export async function pruneExpiredObservations(db: Kysely<Database>, expectedDatabase: string,
  apply: boolean, clock: () => Date = () => new Date(), elapsed: () => number = () => performance.now()): Promise<RetentionResult> {
  await assertDatabaseTarget(db, expectedDatabase);
  await requireLedger(db);
  const at = new Date(clock()), cutoff = retentionCutoff(at), start = elapsed();
  const result: RetentionResult = { mode: apply ? "apply" : "dry_run", cutoff: cutoff.toISOString(),
    disk_runs: 0, baseline_runs: 0, mount_rows: 0, batches: 0, more_eligible: null, outcome: "complete" };
  if (!apply) return db.transaction().execute(async (trx) => {
    await sql`SET TRANSACTION READ ONLY`.execute(trx);
    const disk = await preview(trx, "disk", cutoff), baseline = await preview(trx, "baseline", cutoff);
    return { ...result, disk_runs: disk.parents, baseline_runs: baseline.parents,
      mount_rows: disk.mounts, more_eligible: disk.more || baseline.more };
  });
  const empty = new Set<RunFamily>();
  let next = 0;
  try {
    while (result.batches < retentionBatchLimit && elapsed() - start < retentionBudgetMs && empty.size < 2) {
      const family = families[next++ % families.length]!;
      if (empty.has(family)) continue;
      const batch = await pruneBatch(db, family, cutoff, at);
      if (!batch.parents) { empty.add(family); continue; }
      result[family === "disk" ? "disk_runs" : "baseline_runs"] += batch.parents;
      result.mount_rows += batch.mounts;
      result.batches++;
    }
    const pending = await sql<{ present: boolean }>`SELECT
      EXISTS(SELECT 1 FROM tinywarden.disk_runs WHERE received_at < ${cutoff} LIMIT 1)
      OR EXISTS(SELECT 1 FROM tinywarden.baseline_runs WHERE received_at < ${cutoff} LIMIT 1) AS present`.execute(db);
    result.more_eligible = pending.rows[0]!.present;
    if (result.more_eligible) result.outcome = "bounded";
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    result.outcome = code === "55P03" || code === "57014" || code === "25P04" ? "retryable" : "failed";
  }
  return result;
}
