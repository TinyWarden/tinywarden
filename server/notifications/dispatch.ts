import { randomUUID } from "node:crypto";
import type { Kysely, Transaction } from "kysely";
import type { Database } from "../db/types";
import type { Settings } from "./config";
import type { Event, Outcome, Summary } from "./types";
import { sampleFamily, activeRoute } from "./sampling";
import { closeEvent } from "./transitions";
import { notificationAudit } from "./audit";

export async function claimEvent(db: Kysely<Database>, event: Event, settings: Settings, clock: () => Date) {
  const cursor = await db.selectFrom("notification_cursors").selectAll().where("id", "=", event.cursor_id).executeTakeFirstOrThrow();
  let claim: { event: Event; label: string; hostId: string; key: Summary["key"]; checkName?: string | undefined } | null = null;
  await sampleFamily(db, event.route_id, settings, cursor.host_id, cursor.subject_key, clock, async (trx, summaries) => {
    const route = await activeRoute(trx, event.route_id, settings);
    const current = await trx.selectFrom("notification_outbox").selectAll().where("id", "=", event.id).forUpdate().executeTakeFirstOrThrow();
    const subject = await trx.selectFrom("notification_cursors").selectAll().where("id", "=", current.cursor_id).executeTakeFirstOrThrow();
    const summary = summaries.find((s) => s.key === subject.subject_key);
    if (!summary) { await closeEvent(trx, current, clock(), "cancelled", "scope_changed"); return; }
    const at = new Date(summary.as_of);
    if (current.state !== "pending") return;
    if (at < current.created_at || route.attempt_starts.some((start) => at < start)) throw new Error("notification_clock_rollback");
    if (at.getTime() - current.created_at.getTime() >= 86_400_000) { await closeEvent(trx, current, at, "expired", "event_expired"); return; }
    if (!subject.current || !summary.eligible) { await closeEvent(trx, current, at, "cancelled", "scope_changed"); return; }
    if (subject.suspended || summary.state !== current.to_state || at < current.next_attempt_at) return;
    const starts = route.attempt_starts.filter((start) => at.getTime() - start.getTime() < 3600_000);
    if (starts.length >= 30) return;
    const attemptId = randomUUID();
    const claimed = await trx.updateTable("notification_outbox").set({ state: "in_flight", attempts: current.attempts + 1,
      attempt_id: attemptId, started_at: at, finished_at: null, outcome: null })
      .where("id", "=", current.id).where("state", "=", "pending").returningAll().executeTakeFirstOrThrow();
    await trx.updateTable("notification_routes").set({ attempt_starts: [...starts, at] }).where("id", "=", route.id).execute();
    await notificationAudit(trx, route.id, at, "attempt_started", "attempt_claimed", current.id, attemptId);
    const host = await trx.selectFrom("hosts").select("label").where("id", "=", subject.host_id).executeTakeFirstOrThrow();
    const packageSkill = await trx.selectFrom("skill_installations as i").innerJoin("skill_packages as p", "p.content_sha256", "i.content_sha256")
      .select("p.metadata").where("i.subject_key", "=", subject.subject_key).executeTakeFirst();
    claim = { event: claimed, label: host.label, hostId: subject.host_id, key: subject.subject_key,
      checkName: packageSkill?.metadata.catalog[packageSkill.metadata.manifest.name_key]?.text };
  });
  return claim as { event: Event; label: string; hostId: string; key: Summary["key"]; checkName?: string | undefined } | null;
}
export async function finishEvent(db: Kysely<Database>, event: Event, outcome: Outcome, clock: () => Date) {
  await db.transaction().execute(async (trx) => {
    const at = clock();
    if (!event.started_at || at < event.started_at) throw new Error("notification_clock_rollback");
    const state = outcome.kind === "transient" ? event.attempts < 3 ? "pending" : "failed"
      : outcome.kind === "rejected" ? "failed" : outcome.kind;
    const delay = event.attempts === 1 ? 300_000 : 1800_000;
    const updated = await trx.updateTable("notification_outbox").set({ state, outcome: outcome.code, finished_at: at,
      ...(state === "pending" ? {} : { message_snapshot: null }),
      next_attempt_at: state === "pending" ? new Date(at.getTime() + delay) : at })
      .where("id", "=", event.id).where("attempt_id", "=", event.attempt_id).where("state", "=", "in_flight").returning("id").executeTakeFirst();
    if (!updated) throw new Error("notification_claim_lost");
    if (event.to_state !== "healthy" && ["accepted", "captured", "uncertain"].includes(state)) {
      await trx.updateTable("notification_cursors").set({ exposed: true }).where("id", "=", event.cursor_id).execute();
    }
    await notificationAudit(trx, event.route_id, at, "attempt_finished", event.attempts === 3 && outcome.kind === "transient"
      ? "retry_exhausted" : outcome.code, event.id, event.attempt_id!);
  });
}
export async function expirePending(trx: Transaction<Database>, routeId: string, at: Date) {
  const expired = await trx.selectFrom("notification_outbox").selectAll().where("route_id", "=", routeId)
    .where("state", "=", "pending").where("created_at", "<=", new Date(at.getTime() - 86_400_000)).limit(100).forUpdate().execute();
  for (const event of expired) await closeEvent(trx, event, at, "expired", "event_expired");
}
