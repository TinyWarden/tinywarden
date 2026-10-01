import type { Transaction } from "kysely";
import type { Database } from "../db/types";
import { audit } from "../access/audit";
export async function notificationAudit(trx: Transaction<Database>, routeId: string, at: Date,
  action: "route_configured" | "queued" | "closed" | "acknowledged" | "attempt_started" | "attempt_finished",
  outcome: string, eventId?: string, attemptId?: string) {
  await audit(trx, { action: `notification.${action}`, actorKind: "system", at,
    correlationId: eventId ?? routeId, notificationRouteId: routeId, notificationOutcome: outcome,
    ...(eventId ? { notificationEventId: eventId } : {}), ...(attemptId ? { notificationAttemptId: attemptId } : {}) });
}
