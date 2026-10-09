import type { Kysely } from "kysely";
import type { Database } from "../db/types";
import type { Settings } from "./config";
import type { Transport, Outcome } from "./types";
import { withNotificationLock } from "./lock";
import { recoverClaims } from "./control";
import { sampleFamily } from "./sampling";
import { claimEvent, finishEvent, expirePending } from "./dispatch";
import { notificationAudit } from "./audit";
import { ms } from "../validation";

export async function runNotifications(db: Kysely<Database>, expected: string, settings: Settings, transport: Transport,
  clock = () => new Date(), monotonic = () => performance.now()) {
  if (settings.transport === "disabled") return { outcome: "disabled" };
  if (transport.mode !== settings.transport) throw new Error("notification_transport_mismatch");
  return withNotificationLock(db, expected, async (connection, connectionSignal) => {
    const started = monotonic(), signal = AbortSignal.any([connectionSignal, AbortSignal.timeout(180_000)]);
    const check = () => { if (signal.aborted) throw new Error("notification_connection_lost"); };
    await recoverClaims(connection, clock);
    const route = await connection.transaction().execute(async (trx) => {
      const row = await trx.selectFrom("notification_routes").selectAll().where("current", "=", true).forUpdate().executeTakeFirst();
      if (!row || row.paused || row.transport === "disabled") return null;
      const at = ms(clock());
      if (!row.fingerprint.equals(settings.fingerprint) || row.transport !== settings.transport ||
        at < row.created_at || row.last_invocation_at && at < row.last_invocation_at || row.attempt_starts.some((t) => at < t)) {
        await trx.updateTable("notification_routes").set({ paused: true }).where("id", "=", row.id).execute();
        await notificationAudit(trx, row.id, at, "route_configured", "configuration_or_clock_paused");
        return null;
      }
      if (row.last_invocation_at && at.getTime() - row.last_invocation_at.getTime() < 60_000) return null;
      await trx.updateTable("notification_routes").set({ last_invocation_at: at }).where("id", "=", row.id).execute();
      await expirePending(trx, row.id, at);
      return row;
    });
    if (!route) return { outcome: "paused_or_cooldown" };
    let roster = await connection.selectFrom("hosts").select("id").where("id", ">", route.scan_after ?? "00000000-0000-0000-0000-000000000000")
      .orderBy("id").limit(50).execute();
    if (!roster.length && route.scan_after) roster = await connection.selectFrom("hosts").select("id").orderBy("id").limit(50).execute();
    let sampled = 0, attempts = 0;
    for (const host of roster) {
      let complete = true;
      for (const key of ["contact", "disk-local", "package-updates", "packages"] as const) {
        check();
        if (monotonic() - started >= 20_000) { complete = false; break; }
        await sampleFamily(connection, route.id, settings, host.id, key, clock);
      }
      if (!complete) break;
      await connection.updateTable("notification_routes").set({ scan_after: host.id }).where("id", "=", route.id).execute();
      sampled++;
    }
    const candidates = await connection.selectFrom("notification_outbox as o")
      .innerJoin("notification_cursors as c", "c.id", "o.cursor_id").selectAll("o")
      .where("o.route_id", "=", route.id).where("o.state", "=", "pending").where("c.current", "=", true)
      .where("c.suspended", "=", false).where("o.next_attempt_at", "<=", ms(clock()))
      .orderBy("o.created_at").orderBy("o.id").limit(50).execute();
    for (const event of candidates) {
      check();
      if (attempts >= 5 || monotonic() - started >= 145_000) break;
      const claim = await claimEvent(connection, event, settings, clock);
      if (!claim) continue;
      check();
      let outcome: Outcome;
      try { outcome = await transport.send({ eventId: claim.event.id, hostId: claim.hostId,
        label: claim.label, key: claim.key, checkName: claim.checkName, state: claim.event.to_state, sampledAt: claim.event.sampled_at,
        templateVersion: claim.event.template_version, fromState: claim.event.from_state, snapshot: claim.event.message_snapshot }, signal); }
      catch { outcome = { kind: "uncertain", code: "submission_unknown" }; }
      check();
      await finishEvent(connection, claim.event, outcome, clock);
      attempts++;
    }
    return { outcome: "completed", sampled, attempts };
  });
}
