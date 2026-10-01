import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "../db/types";
import { assertDatabaseTarget } from "../db/target";
import { uuid, ms } from "../validation";
import type { Settings } from "./config";
import { withNotificationLock } from "./lock";
import { closeEvent } from "./transitions";
import { notificationAudit } from "./audit";

export async function configureNotifications(db: Kysely<Database>, expected: string, settings: Settings,
  rotate = false, clock = () => new Date()) {
  return withNotificationLock(db, expected, async (connection) => {
    await recoverClaims(connection, clock);
    return connection.transaction().execute(async (trx) => {
    const current = await trx.selectFrom("notification_routes").selectAll().where("current", "=", true).forUpdate().executeTakeFirst();
    const at = ms(clock());
    if (current && (at < current.created_at || current.last_invocation_at && at < current.last_invocation_at)) throw new Error("notification_clock_rollback");
    if (current && !rotate && current.fingerprint.equals(settings.fingerprint)) {
      await trx.updateTable("notification_routes").set({ paused: false }).where("id", "=", current.id).execute();
      await notificationAudit(trx, current.id, at, "route_configured", "configuration_confirmed");
      return { outcome: "configured", routeId: current.id, changed: false };
    }
    if (current) {
      // Set cancellation atomically in SQL; queue size must not extend a transaction by per-row queries.
      const cancelled = await trx.updateTable("notification_outbox").set({ state: "cancelled", outcome: "route_retired", finished_at: at })
        .where("route_id", "=", current.id).where("state", "=", "pending").executeTakeFirst();
      await trx.updateTable("notification_routes").set({ current: false, paused: true }).where("id", "=", current.id).execute();
      if (cancelled.numUpdatedRows > 0n) await notificationAudit(trx, current.id, at, "route_configured", "route_retired");
    }
    const routeId = randomUUID();
    await trx.insertInto("notification_routes").values({ id: routeId, fingerprint: settings.fingerprint,
      transport: settings.transport, current: true, paused: false, created_at: at,
      scan_after: null, last_invocation_at: null, attempt_starts: [] }).execute();
    await notificationAudit(trx, routeId, at, "route_configured", rotate ? "epoch_rotated" : "route_configured");
    return { outcome: "configured", routeId, changed: true };
    });
  });
}
export async function pauseNotifications(db: Kysely<Database>, expected: string, clock = () => new Date()) {
  return withNotificationLock(db, expected, async (connection) => connection.transaction().execute(async (trx) => {
    const route = await trx.selectFrom("notification_routes").select("id").where("current", "=", true).forUpdate().executeTakeFirst();
    if (route) {
      const at = ms(clock());
      await trx.updateTable("notification_routes").set({ paused: true }).where("id", "=", route.id).execute();
      await notificationAudit(trx, route.id, at, "route_configured", "configuration_paused");
    }
    return { outcome: "paused" };
  }));
}
export async function acknowledgeUncertainty(db: Kysely<Database>, expected: string, rawId: string, clock = () => new Date()) {
  const id = uuid(rawId);
  return withNotificationLock(db, expected, async (connection) => connection.transaction().execute(async (trx) => {
    const event = await trx.selectFrom("notification_outbox").selectAll().where("id", "=", id).forUpdate().executeTakeFirstOrThrow();
    if (event.state !== "uncertain") throw new Error("not_uncertain");
    const at = ms(clock());
    if (at < event.created_at || event.finished_at && at < event.finished_at) throw new Error("notification_clock_rollback");
    if (!event.acknowledged_at) {
      await trx.updateTable("notification_outbox").set({ acknowledged_at: at }).where("id", "=", id).execute();
      await notificationAudit(trx, event.route_id, at, "acknowledged", "reviewed_without_resend", id);
    }
    return { outcome: "acknowledged", eventId: id };
  }));
}
export async function notificationStatus(db: Kysely<Database>, expected: string) {
  await assertDatabaseTarget(db, expected);
  return db.transaction().execute(async (trx) => {
    const route = await trx.selectFrom("notification_routes").select(["id", "transport", "paused"])
      .where("current", "=", true).executeTakeFirst();
    const counts = await trx.selectFrom("notification_outbox").select(["state", (eb) => eb.fn.countAll<string>().as("count")])
      .groupBy("state").execute();
    const recent = await trx.selectFrom("notification_outbox").select(["id", "route_id", "state", "attempts", "outcome", "sampled_at", "finished_at", "acknowledged_at"])
      .orderBy("created_at", "desc").orderBy("id", "desc").limit(50).execute();
    return { route: route ?? null, counts, recent };
  });
}
// Every interrupted claim remains visible, including one from a retired epoch.
export async function recoverClaims(db: Kysely<Database>, clock: () => Date) {
  await db.transaction().execute(async (trx) => {
    const events = await trx.selectFrom("notification_outbox").selectAll().where("state", "=", "in_flight").limit(50).forUpdate().execute();
    const at = ms(clock());
    for (const event of events) {
      if (event.started_at && at < event.started_at) throw new Error("notification_clock_rollback");
      await trx.updateTable("notification_outbox").set({ state: "uncertain", outcome: "abandoned_claim", finished_at: at })
        .where("id", "=", event.id).where("attempt_id", "=", event.attempt_id).where("state", "=", "in_flight").execute();
      if (event.to_state !== "healthy") await trx.updateTable("notification_cursors").set({ exposed: true }).where("id", "=", event.cursor_id).execute();
      await notificationAudit(trx, event.route_id, at, "attempt_finished", "abandoned_claim", event.id, event.attempt_id!);
    }
  });
}
export { closeEvent };
