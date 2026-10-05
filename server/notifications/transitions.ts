import { randomUUID } from "node:crypto";
import type { Transaction } from "kysely";
import type { Database } from "../db/types";
import type { DefinitiveState } from "../db/notification-types";
import type { Summary, Route, Event } from "./types";
import type { Settings } from "./config";
import { notificationAudit } from "./audit";

export async function closeEvent(trx: Transaction<Database>, event: Event, at: Date,
  state: "cancelled" | "expired", reason: string) {
  const changed = await trx.updateTable("notification_outbox").set({ state, outcome: reason, finished_at: at })
    .where("id", "=", event.id).where("state", "=", "pending").returning("id").executeTakeFirst();
  if (changed) await notificationAudit(trx, event.route_id, at, "closed", reason, event.id);
}
async function cancelPending(trx: Transaction<Database>, cursorId: string, at: Date, reason: string) {
  const events = await trx.selectFrom("notification_outbox").selectAll().where("cursor_id", "=", cursorId)
    .where("state", "=", "pending").forUpdate().execute();
  for (const event of events) await closeEvent(trx, event, at, "cancelled", reason);
}
export async function sampleTransition(trx: Transaction<Database>, route: Route, settings: Settings, summary: Summary) {
  const at = new Date(summary.as_of);
  let cursor = await trx.selectFrom("notification_cursors").selectAll().where("route_id", "=", route.id)
    .where("host_id", "=", summary.host_id).where("subject_key", "=", summary.key)
    .where("current", "=", true).forUpdate().executeTakeFirst();
  if (cursor && at < cursor.sampled_at) throw new Error("notification_clock_rollback");
  const matches = cursor && summary.eligible && cursor.agent_id === summary.agent_id && cursor.generation === summary.generation &&
    cursor.enablement_version === (summary.enablement_version ?? "1") && cursor.source_revision === summary.source_revision && cursor.policy_version === summary.policy_version;
  if (cursor && !matches) {
    await cancelPending(trx, cursor.id, at, "scope_changed");
    await trx.updateTable("notification_cursors").set({ current: false, exposed: false }).where("id", "=", cursor.id).execute();
    cursor = undefined;
  }
  if (!summary.eligible || !summary.agent_id || !summary.generation) return null;
  if (!cursor) cursor = await trx.insertInto("notification_cursors").values({ id: randomUUID(), route_id: route.id,
    host_id: summary.host_id, agent_id: summary.agent_id, generation: summary.generation, subject_key: summary.key,
    enablement_version: summary.enablement_version ?? "1", source_revision: summary.source_revision, policy_version: summary.policy_version, current: true, sampled_at: at,
    last_state: null, suspended: true, exposed: false, transition_number: 0 }).returningAll().executeTakeFirstOrThrow();
  const definitive = ["healthy", "warning", "critical", "offline"].includes(summary.state)
    ? summary.state as DefinitiveState : null;
  if (!definitive) {
    await trx.updateTable("notification_cursors").set({ sampled_at: at, suspended: true }).where("id", "=", cursor.id).execute();
    return cursor.id;
  }
  const changed = definitive !== cursor.last_state;
  const number = changed ? Number(cursor.transition_number) + 1 : Number(cursor.transition_number);
  if (!Number.isSafeInteger(number)) throw new Error("notification_sequence_exhausted");
  if (changed) {
    await cancelPending(trx, cursor.id, at, "state_superseded");
    const emit = definitive === "healthy" ? cursor.exposed && settings.recoveries
      : definitive !== "warning" || settings.warnings;
    if (emit) {
      const id = randomUUID();
      await trx.insertInto("notification_outbox").values({ id, route_id: route.id, cursor_id: cursor.id,
        transition_number: number, from_state: cursor.last_state, to_state: definitive,
        sampled_at: at, created_at: at, template_version: 1, state: "pending", attempts: 0,
        next_attempt_at: at, attempt_id: null, started_at: null, finished_at: null, outcome: null, acknowledged_at: null }).execute();
      await notificationAudit(trx, route.id, at, "queued", "state_changed", id);
    }
  }
  await trx.updateTable("notification_cursors").set({ sampled_at: at, suspended: false, last_state: definitive,
    transition_number: number, exposed: definitive === "healthy" ? false : cursor.exposed }).where("id", "=", cursor.id).execute();
  return cursor.id;
}
