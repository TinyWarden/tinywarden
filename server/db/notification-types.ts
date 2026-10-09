import type { SkillKey } from "../../lib/skills/catalog";
import type { PackageSkillId } from "../../lib/skills/package-types";
import type { ColumnType } from "kysely";
type Instant = ColumnType<Date, Date | string, Date | string>;
type Integer = ColumnType<string, string | number, string | number>;
export type NotificationKey = "contact" | SkillKey | PackageSkillId;
export type DefinitiveState = "healthy" | "warning" | "critical" | "offline";
export type DeliveryState = "pending" | "in_flight" | "accepted" | "captured" | "failed" | "uncertain" | "cancelled" | "expired";
export interface NotificationRoutes {
  id: string; fingerprint: Buffer; transport: "disabled" | "capture" | "smtp";
  current: boolean; paused: boolean; created_at: Instant;
  scan_after: string | null; last_invocation_at: Instant | null;
  attempt_starts: ColumnType<Date[], Date[], Date[]>;
}
export interface NotificationCursors {
  id: string; route_id: string; host_id: string; agent_id: string; generation: Integer;
  enablement_version: ColumnType<string, string | number | undefined, string | number>;
  subject_key: NotificationKey; source_revision: Integer; policy_version: Integer;
  current: boolean; sampled_at: Instant; last_state: DefinitiveState | null;
  suspended: boolean; exposed: boolean; transition_number: Integer;
}
export interface NotificationOutbox {
  id: string; route_id: string; cursor_id: string; transition_number: Integer;
  from_state: DefinitiveState | null; to_state: DefinitiveState;
  sampled_at: Instant; created_at: Instant; template_version: number;
  message_snapshot: ColumnType<unknown, unknown | undefined, unknown>;
  state: DeliveryState; attempts: number; next_attempt_at: Instant;
  attempt_id: string | null; started_at: Instant | null; finished_at: Instant | null;
  outcome: string | null; acknowledged_at: Instant | null;
}
export interface NotificationTables {
  notification_routes: NotificationRoutes;
  notification_cursors: NotificationCursors;
  notification_outbox: NotificationOutbox;
}
