import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import type { Database } from "../db/types";
import { assertDatabaseTarget } from "../db/target";
import { requireCurrentLedger } from "../db/ledger";
import { observeConnectionFailure } from "../db/client";
import { ms } from "../validation";
import { captureHistoryFamily } from "./sampling";

export async function withHistoryLock<T>(db: Kysely<Database>, expected: string,
  work: (connection: Kysely<Database>, signal: AbortSignal) => Promise<T>) {
  return db.connection().execute(async (connection) => {
    await assertDatabaseTarget(connection, expected); await requireCurrentLedger(connection);
    const result = await sql<{ acquired: boolean; pid: number }>`SELECT
      pg_try_advisory_lock(1415007823,5) AS acquired, pg_backend_pid() AS pid`.execute(connection);
    if (!result.rows[0]?.acquired) return { outcome: "busy" as const };
    const controller = new AbortController();
    let unwatch = () => {};
    try { unwatch = observeConnectionFailure(db, result.rows[0]!.pid, () => controller.abort());
      return await work(connection, controller.signal); }
    finally { unwatch(); controller.abort(); await sql`SELECT pg_advisory_unlock(1415007823,5)`.execute(connection).catch(() => undefined); }
  });
}
export async function runHistory(db: Kysely<Database>, expected: string,
  clock = () => new Date(), elapsed = () => performance.now()) {
  return withHistoryLock(db, expected, async (connection, signal) => {
    const started = elapsed();
    const initial = await connection.transaction().execute(async (trx) => {
      const at = ms(clock());
      await trx.insertInto("history_control").values({ singleton: true, epoch: randomUUID(), activated_at: at,
        scan_after: null, scan_started_at: at, scan_completed_at: null, last_invocation_at: null })
        .onConflict((oc) => oc.column("singleton").doNothing()).execute();
      const row = await trx.selectFrom("history_control").selectAll().where("singleton", "=", true).forUpdate().executeTakeFirstOrThrow();
      if (at < row.activated_at || row.last_invocation_at && at < row.last_invocation_at) throw new Error("history_clock_rollback");
      if (row.last_invocation_at && at.getTime() - row.last_invocation_at.getTime() < 60000) return null;
      await trx.updateTable("history_control").set({ last_invocation_at: at,
        ...(!row.scan_after ? { scan_started_at: at } : {}) }).where("singleton", "=", true).execute();
      return { ...row, invocation_at: at };
    });
    if (!initial) return { outcome: "cooldown" as const };
    const roster = await connection.selectFrom("hosts").select("id")
      .where("id", ">", initial.scan_after ?? "00000000-0000-0000-0000-000000000000").orderBy("id").limit(50).execute();
    let sampled = 0, events = 0;
    for (const host of roster) {
      let complete = true;
      for (const family of ["contact", "disk-local", "package-updates", "packages"] as const) {
        if (signal.aborted) throw new Error("history_connection_lost");
        if (elapsed() - started >= 20000) { complete = false; break; }
        events += await captureHistoryFamily(connection, initial.epoch, host.id, family, clock);
      }
      if (!complete) break;
      if (signal.aborted) throw new Error("history_connection_lost");
      await connection.updateTable("history_control").set({ scan_after: host.id }).where("epoch", "=", initial.epoch).execute();
      sampled++;
    }
    if (sampled === roster.length && roster.length < 50) {
      const at = ms(clock());
      if (at < initial.invocation_at) throw new Error("history_clock_rollback");
      await connection.updateTable("history_control").set({ scan_after: null, scan_completed_at: at })
        .where("epoch", "=", initial.epoch).execute();
    }
    return { outcome: sampled === roster.length ? "completed" as const : "bounded" as const, sampled, events };
  });
}
export async function historyStatus(db: Kysely<Database>, expected: string) {
  await assertDatabaseTarget(db, expected); await requireCurrentLedger(db);
  const control = await db.selectFrom("history_control").selectAll().where("singleton", "=", true).executeTakeFirst();
  return { active: !!control, activated_at: control?.activated_at.toISOString() ?? null,
    last_invocation_at: control?.last_invocation_at?.toISOString() ?? null,
    scan_completed_at: control?.scan_completed_at?.toISOString() ?? null };
}
export async function resetHistory(db: Kysely<Database>, expected: string, clock = () => new Date()) {
  return withHistoryLock(db, expected, async (connection) => connection.transaction().execute(async (trx) => {
    const at = ms(clock()), epoch = randomUUID();
    await trx.insertInto("history_control").values({ singleton: true, epoch, activated_at: at,
      scan_after: null, scan_started_at: null, scan_completed_at: null, last_invocation_at: null })
      .onConflict((oc) => oc.column("singleton").doUpdateSet({ epoch, activated_at: at, scan_after: null,
        scan_started_at: null, scan_completed_at: null, last_invocation_at: null })).execute();
    await trx.updateTable("history_subjects").set({ suspended: true, continuous_since: null, facts: null }).execute();
    return { outcome: "reset" as const, activated_at: at.toISOString() };
  }));
}
