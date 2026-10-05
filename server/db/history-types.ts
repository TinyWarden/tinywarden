import type { SkillKey } from "../../lib/skills/catalog";
import type { PackageSkillId } from "../../lib/skills/package-types";
import type { ColumnType } from "kysely";

type Instant = ColumnType<Date, Date | string, Date | string>;
type Counter = ColumnType<string, string | number, string | number>;
export type HistoryKey = "contact" | SkillKey | PackageSkillId;
export type HistoryState = "healthy" | "warning" | "critical" | "unknown" | "stale" | "offline" | "disabled";
export interface HistoryControl {
  singleton: boolean; epoch: string; activated_at: Instant;
  scan_after: string | null; scan_started_at: Instant | null;
  scan_completed_at: Instant | null; last_invocation_at: Instant | null;
}
export interface HistorySubjects {
  id: string; host_id: string; subject_key: HistoryKey; epoch: string;
  agent_id: string | null; generation: Counter | null;
  enablement_version: ColumnType<string, string | number | undefined, string | number>;
  source_revision: Counter; policy_version: Counter; assessment_version: number | null;
  state: HistoryState; reason: string; first_seen_at: Instant;
  continuous_since: Instant | null; last_sample_at: Instant; measured_at: Instant | null;
  facts: unknown; suspended: boolean; transition_number: Counter;
}
export interface HistoryEvents {
  id: string; cursor_id: string; transition_number: Counter; epoch: string;
  host_id: string; subject_key: HistoryKey; agent_id: string | null; generation: Counter | null;
  enablement_version: ColumnType<string, string | number | undefined, string | number>;
  source_revision: Counter; policy_version: Counter; assessment_version: number | null;
  kind: "state" | "context" | "gap"; from_state: HistoryState | null; to_state: HistoryState;
  from_reason: string | null; to_reason: string; previous_sample_at: Instant | null;
  observed_at: Instant; measured_at: Instant | null; after_gap: boolean;
  previous_scope: unknown; before_facts: unknown; after_facts: unknown;
}
export interface HistoryTables {
  history_control: HistoryControl; history_subjects: HistorySubjects; history_events: HistoryEvents;
}
