import {previewMaintenanceExpiry,pruneMaintenanceBatch,maintenanceExpiry} from './job-retention';
import {purgeNextBatch} from "../fleet/purge";
import {retentionPolicy,beginRetentionPass} from "../data/retention-policy";
import {previewResourceExpiry,pruneResourceBatch} from "../skills/resources/retention";
import {previewManualExpiry,pruneManualBatch,manualExpiryCondition} from "../skills/manual/retention";
import {pruneRepositoryPreviews} from "../skills/repositories/retention";
import { performance } from "node:perf_hooks";
import { sql, type Kysely } from "kysely";
import type { Database } from "../db/types";
import { assertDatabaseTarget } from "../db/target";
import { requireCurrentLedger } from "../db/ledger";
import { previewObservations, pruneObservationBatch } from "../skills/results/retention";
import { previewHistoryExpiry, pruneHistoryBatch } from "../history/retention";
import { previewPackageExpiry, prunePackageBatch } from "../skills/results/package-retention";
import { retentionBatchLimit, retentionBudgetMs } from "../skills/results/retention-policy";
import { previewMessageExpiry, pruneMessageBatch } from "../notifications/retention";

async function purgeSummary(db: Kysely<Database>){
  const row=(await sql<{pending:string;failed:string}>`SELECT count(*) FILTER(WHERE state IN ('pending','running'))::text pending,count(*) FILTER(WHERE state='failed')::text failed FROM tinywarden.fleet_purge_jobs WHERE state<>'completed'`.execute(db)).rows[0]!;
  return {pending:Number(row.pending),failed:Number(row.failed)};
}
export type RetentionResult = { fleet_purge:{pending:number;failed:number;rows:number}; mode: "dry_run" | "apply"; cutoff: string;
  disk_runs: number; baseline_runs: number; mount_rows: number; history_events: number; history_cursors: number; package_readings:number; package_states:number;
  resource_inventories:number;resource_memberships:number;maintenance_jobs:number;
  batches: number; more_eligible: boolean | null; outcome: "complete" | "bounded" | "retryable" | "failed" };
const families = ["fleet", "disk", "baseline", "history", "packages", "messages", "manual", "resources", "maintenance_jobs"] as const;
export async function pruneExpiredObservations(db: Kysely<Database>, expectedDatabase: string,
  apply: boolean, clock = () => new Date(), elapsed = () => performance.now()): Promise<RetentionResult> {
  await assertDatabaseTarget(db, expectedDatabase); await requireCurrentLedger(db);
  const at = new Date(clock()), policy=apply?await beginRetentionPass(db,at):await db.transaction().execute(trx=>retentionPolicy(trx,at)), cutoff=policy.cutoff, start = elapsed();
  const result: RetentionResult = { fleet_purge:{...await purgeSummary(db),rows:0},mode: apply ? "apply" : "dry_run", cutoff: cutoff.toISOString(),
    disk_runs: 0, baseline_runs: 0, mount_rows: 0, history_events: 0, history_cursors: 0, package_readings:0, package_states:0,
    resource_inventories:0,resource_memberships:0,maintenance_jobs:0,batches: 0, more_eligible: null, outcome: "complete" };
  if (!apply) return db.transaction().execute(async (trx) => {
    await sql`SET TRANSACTION READ ONLY`.execute(trx);
    const disk = await previewObservations(trx, "disk", cutoff), baseline = await previewObservations(trx, "baseline", cutoff);
    const history = await previewHistoryExpiry(trx, cutoff);
    const packages = await previewPackageExpiry(trx,cutoff);
    const resources=await previewResourceExpiry(trx,cutoff),maintenance=await previewMaintenanceExpiry(trx,cutoff);
    const notificationSnapshots = await previewMessageExpiry(trx, cutoff);
    return { ...result, disk_runs: disk.parents, baseline_runs: baseline.parents, mount_rows: disk.mounts,
      history_events: history.events, history_cursors: history.cursors, package_readings:packages.readings,package_states:packages.states,
      maintenance_jobs:maintenance,resource_inventories:resources.inventories,resource_memberships:resources.memberships,more_eligible: maintenance>0 || result.fleet_purge.pending>0 || resources.more || disk.more || baseline.more || history.more || packages.more || notificationSnapshots > 0 || await previewManualExpiry(trx,cutoff) };
  });
  const empty = new Set<string>(); let next = 0;
  try {
    await pruneRepositoryPreviews(db,at);
    while (result.batches < retentionBatchLimit && elapsed() - start < retentionBudgetMs && empty.size < families.length) {
      const family = families[next++ % families.length]!;
      if (empty.has(family)) continue;
      let parents: number;
      if(family==="fleet"){const batch=await purgeNextBatch(db,clock);parents=batch.worked?1:0;result.fleet_purge.rows+=batch.rows;
      }else if(family==="maintenance_jobs"){parents=await pruneMaintenanceBatch(db,cutoff,policy.revision);result.maintenance_jobs+=parents;
      }else if(family==="resources"){const batch=await pruneResourceBatch(db,cutoff,policy.revision);parents=batch.parents;result.resource_inventories+=batch.inventories;result.resource_memberships+=batch.memberships;
      } else if(family==="manual") { parents=await pruneManualBatch(db,cutoff,policy.revision);
      } else if (family === "messages") {
        parents = await pruneMessageBatch(db, cutoff,policy.revision);
      } else if(family === "packages") {
        const batch=await prunePackageBatch(db,cutoff,at,policy.revision,policy.days);parents=batch.parents;result.package_readings+=batch.readings;result.package_states+=batch.states;
      } else if (family === "history") {
        const batch = await pruneHistoryBatch(db, cutoff, at,policy.revision,policy.days); parents = batch.parents;
        result.history_events += batch.events; result.history_cursors += batch.cursors;
      } else {
        const batch = await pruneObservationBatch(db, family, cutoff, at,policy.revision,policy.days); parents = batch.parents;
        result[family === "disk" ? "disk_runs" : "baseline_runs"] += parents;
        result.mount_rows += batch.mounts;
      }
      if (!parents) empty.add(family); else result.batches++;
    }
    const pending = await sql<{ present: boolean }>`SELECT
      EXISTS(SELECT 1 FROM tinywarden.fleet_purge_jobs WHERE state IN ('pending','running') LIMIT 1) OR
      EXISTS(SELECT 1 FROM tinywarden.skill_manual_runs m WHERE ${manualExpiryCondition(cutoff)} LIMIT 1)
      OR EXISTS(SELECT 1 FROM tinywarden.maintenance_jobs j WHERE ${maintenanceExpiry(cutoff)} LIMIT 1)
      OR EXISTS(SELECT 1 FROM tinywarden.disk_runs WHERE received_at < ${cutoff} LIMIT 1)
      OR EXISTS(SELECT 1 FROM tinywarden.baseline_runs WHERE received_at < ${cutoff} LIMIT 1)
      OR EXISTS(SELECT 1 FROM tinywarden.skill_observations WHERE received_at < ${cutoff} LIMIT 1)
      OR EXISTS(SELECT 1 FROM tinywarden.skill_states WHERE updated_at < ${cutoff} LIMIT 1)
      OR EXISTS(SELECT 1 FROM tinywarden.notification_outbox WHERE created_at < ${cutoff} AND message_snapshot IS NOT NULL LIMIT 1)
      OR EXISTS(SELECT 1 FROM tinywarden.history_events WHERE observed_at < ${cutoff} LIMIT 1)
      OR EXISTS(SELECT 1 FROM tinywarden.history_subjects WHERE last_sample_at < ${cutoff} AND facts IS NOT NULL LIMIT 1) AS present`.execute(db);
    result.more_eligible = pending.rows[0]!.present || await db.transaction().execute(async trx=>(await previewResourceExpiry(trx,cutoff)).more);
    result.fleet_purge={...await purgeSummary(db),rows:result.fleet_purge.rows};
    if(result.fleet_purge.failed)result.outcome="failed";else if (result.more_eligible) result.outcome = "bounded";
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    result.outcome = error instanceof Error&&error.message==="retention_policy_changed" || code === "55P03" || code === "57014" || code === "25P04" ? "retryable" : "failed";
  }
  return result;
}
