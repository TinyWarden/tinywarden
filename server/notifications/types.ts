import type { Selectable } from "kysely";
import type { NotificationRoutes, NotificationCursors, NotificationOutbox, NotificationKey } from "../db/notification-types";
import type { PackageAssessment, PackageMetadata, SkillSettings } from "../../lib/skills/package-types";
import type { HistoryFacts } from "../history/types";
export type Route = Selectable<NotificationRoutes>;
export type Cursor = Selectable<NotificationCursors>;
export type Event = Selectable<NotificationOutbox>;
export interface Summary {
  host_id: string; agent_id: string | null; generation: string | null; key: NotificationKey;
  enablement_version?: string;
  source_revision: string; policy_version: string; eligible: boolean;
  state: string; reason: string; as_of: string; valid_until: string | null;
  current_assignment_id: string | null;
  name?: string; metadata?: PackageMetadata; assessment?: PackageAssessment | null; settings?: SkillSettings | null;
  measured_at?: string | null; content_sha256?: string;
  facts?: HistoryFacts;
}
export type Outcome = { kind: "accepted" | "captured" | "transient" | "rejected" | "uncertain";
  code: "relay_accepted" | "capture_only" | "connection_failed" | "temporary_refusal" | "permanent_refusal"
    | "configuration_failed" | "submission_unknown" | "attempt_cancelled" };
export interface Mail { eventId: string; hostId: string; label: string; key: NotificationKey; checkName?: string | undefined;
  state: string; sampledAt: Date; templateVersion?: number; fromState?: string | null; snapshot?: unknown }
export interface Transport { mode: "capture" | "smtp"; send(mail: Mail, signal: AbortSignal): Promise<Outcome> }
