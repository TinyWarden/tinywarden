import type { Selectable } from "kysely";
import type { NotificationRoutes, NotificationCursors, NotificationOutbox, NotificationKey } from "../db/notification-types";
export type Route = Selectable<NotificationRoutes>;
export type Cursor = Selectable<NotificationCursors>;
export type Event = Selectable<NotificationOutbox>;
export interface Summary {
  host_id: string; agent_id: string | null; generation: string | null; key: NotificationKey;
  source_revision: string; policy_version: string; eligible: boolean;
  state: string; reason: string; as_of: string; valid_until: string | null;
  current_assignment_id: string | null;
}
export type Outcome = { kind: "accepted" | "captured" | "transient" | "rejected" | "uncertain";
  code: "relay_accepted" | "capture_only" | "connection_failed" | "temporary_refusal" | "permanent_refusal"
    | "configuration_failed" | "submission_unknown" | "attempt_cancelled" };
export interface Mail { eventId: string; hostId: string; label: string; key: NotificationKey; state: string; sampledAt: Date }
export interface Transport { mode: "capture" | "smtp"; send(mail: Mail, signal: AbortSignal): Promise<Outcome> }
