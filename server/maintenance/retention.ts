import {previewManualExpiry,pruneManualBatch} from "../skills/manual/retention";
import { performance } from "node:perf_hooks";
import { sql, type Kysely } from "kysely";
import type { Database } from "../db/types";
import { assertDatabaseTarget } from "../db/target";
import { requireCurrentLedger } from "../db/ledger";
import { previewObservations, pruneObservationBatch } from "../skills/results/retention";
import { previewHistoryExpiry, pruneHistoryBatch } from "../history/retention";
import { previewPackageExpiry, prunePackageBatch } from "../skills/results/package-retention";
import { retentionCutoff, retentionBatchLimit, retentionBudgetMs } from "../skills/results/retention-policy";
import { previewMessageExpiry, pruneMessageBatch } from "../notifications/retention";

export type RetentionResult = { mode: "dry_run" | "apply"; cutoff: string;
  disk_runs: number; baseline_runs: number; mount_rows: number; history_events: number; history_cursors: number; package_readings:number; package_states:number;
  batches: number; more_eligible: boolean | null; outcome: "complete" | "bounded" | "retryable" | "failed" };
const families = ["disk", "baseline", "history", "packages", "messages", "manual"] as const;
export async function pruneExpiredObservations(db: Kysely<Database>, expectedDatabase: string,
  apply: boolean, clock = () => new Date(), elapsed = () => performance.now()): Promise<RetentionResult> {
  await assertDatabaseTarget(db, expectedDatabase); await requireCurrentLedger(db);
  const at = new Date(clock()), cutoff = retentionCutoff(at), start = elapsed();
  const result: RetentionResult = { mode: apply ? "apply" : "dry_run", cutoff: cutoff.toISOString(),
    disk_runs: 0, baseline_runs: 0, mount_rows: 0, history_events: 0, history_cursors: 0, package_readings:0, package_states:0,
    batches: 0, more_eligible: null, outcome: "complete" };
  if (!apply) return db.transaction().execute(async (trx) => {
    await sql`SET TRANSACTION READ ONLY`.execute(trx);
    const disk = await previewObservations(trx, "disk", cutoff), baseline = await previewObservations(trx, "baseline", cutoff);
    const history = await previewHistoryExpiry(trx, cutoff);
    const packages = await previewPackageExpiry(trx,cutoff);
    const notificationSnapshots = await previewMessageExpiry(trx, cutoff);
    return { ...result, disk_runs: disk.parents, baseline_runs: baseline.parents, mount_rows: disk.mounts,
      history_events: history.events, history_cursors: history.cursors, package_readings:packages.readings,package_states:packages.states,
      more_eligible: disk.more || baseline.more || history.more || packages.more || notificationSnapshots > 0 || await previewManualExpiry(trx,cutoff) };
  });
  const empty = new Set<string>(); let next = 0;
  try {
    while (result.batches < retentionBatchLimit && elapsed() - start < retentionBudgetMs && empty.size < families.length) {
      const family = families[next++ % families.length]!;
      if (empty.has(family)) continue;
      let parents: number;
      if(family==="manual") { parents=await pruneManualBatch(db,cutoff);
      } else if (family === "messages") {
        parents = await pruneMessageBatch(db, cutoff);
      } else if(family === "packages") {
        const batch=await prunePackageBatch(db,cutoff,at);parents=batch.parents;result.package_readings+=batch.readings;result.package_states+=batch.states;
      } else if (family === "history") {
        const batch = await pruneHistoryBatch(db, cutoff, at); parents = batch.parents;
        result.history_events += batch.events; result.history_cursors += batch.cursors;
      } else {
        const batch = await pruneObservationBatch(db, family, cutoff, at); parents = batch.parents;
        result[family === "disk" ? "disk_runs" : "baseline_runs"] += parents;
        result.mount_rows += batch.mounts;
      }
      if (!parents) empty.add(family); else result.batches++;
    }
    const pending = await sql<{ present: boolean }>`SELECT
      EXISTS(SELECT 1 FROM tinywarden.skill_manual_runs WHERE requested_at < ${cutoff} LIMIT 1)
      OR EXISTS(SELECT 1 FROM tinywarden.disk_runs WHERE received_at < ${cutoff} LIMIT 1)
      OR EXISTS(SELECT 1 FROM tinywarden.baseline_runs WHERE received_at < ${cutoff} LIMIT 1)
      OR EXISTS(SELECT 1 FROM tinywarden.skill_observations WHERE received_at < ${cutoff} LIMIT 1)
      OR EXISTS(SELECT 1 FROM tinywarden.skill_states WHERE updated_at < ${cutoff} LIMIT 1)
      OR EXISTS(SELECT 1 FROM tinywarden.notification_outbox WHERE created_at < ${cutoff} AND message_snapshot IS NOT NULL LIMIT 1)
      OR EXISTS(SELECT 1 FROM tinywarden.history_events WHERE observed_at < ${cutoff} LIMIT 1)
      OR EXISTS(SELECT 1 FROM tinywarden.history_subjects WHERE last_sample_at < ${cutoff} AND facts IS NOT NULL LIMIT 1) AS present`.execute(db);
    result.more_eligible = pending.rows[0]!.present;
    if (result.more_eligible) result.outcome = "bounded";
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    result.outcome = code === "55P03" || code === "57014" || code === "25P04" ? "retryable" : "failed";
  }
  return result;
}
