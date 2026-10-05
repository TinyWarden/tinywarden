import type { SkillControl } from "./skill-types";
import type { ColumnType } from "kysely";

type Instant = ColumnType<Date, Date | string, Date | string>;
type Counter = ColumnType<string, string | number, string | number>;
export interface BaselineDefinitions extends SkillControl { definition_key: string; current_revision: Counter }
export interface BaselineDefinitionRevisions {
  definition_key: string; revision: Counter; normalizer: string; evaluator: string;
  interval_seconds: number; timeout_seconds: number; package_mode: string; recipe: unknown; created_at: Instant;
}
export interface BaselinePolicies {
  host_id: string; definition_key: string; current_policy_version: Counter; last_delivery_revision: Counter;
}
export interface BaselinePolicyRevisions {
  override_fields: ColumnType<string[] | null, string[] | null | undefined, string[] | null>;
  host_id: string; definition_key: string; version: Counter; mode: string;
  interval_seconds: number | null; timeout_seconds: number | null; package_mode: string | null;
  pinned_definition_revision: Counter | null; created_at: Instant;
}
export interface BaselineSnapshots {
  id: string; host_id: string; agent_id: string; generation: Counter; definition_key: string;
  revision: Counter; definition_revision: Counter; policy_version: Counter; mode: string;
  enablement_version: ColumnType<string, string | number | undefined, string | number>;
  applicability: string; normalizer: string; evaluator: string; interval_seconds: number;
  timeout_seconds: number; package_mode: string; recipe: unknown; created_at: Instant; payload_digest: Buffer;
}
export interface BaselineReceipts {
  operator_id: string; request_id: string; root: string; definition_key: string; host_id: string | null;
  request_fingerprint: Buffer; changed: boolean; resulting_definition_revision: Counter | null;
  resulting_policy_version: Counter | null; completed_at: Instant;
}
export interface BaselineRuns {
  id: string; host_id: string; agent_id: string; generation: Counter; definition_key: string;
  run_sequence: Counter; assignment_id: string; started_at: Instant; finished_at: Instant;
  received_at: Instant; dropped_runs: Counter; observation: unknown; request_digest: Buffer;
  assessment_version: ColumnType<number, number | undefined, number>;
  fstrim_context: ColumnType<unknown, unknown | undefined, unknown>;
}
export interface BaselineRecovery {
  host_id: string; agent_id: string; generation: Counter; reason: string; latched_at: Instant;
}
export interface BaselineTables {
  baseline_definitions: BaselineDefinitions;
  baseline_definition_revisions: BaselineDefinitionRevisions;
  baseline_policies: BaselinePolicies;
  baseline_policy_revisions: BaselinePolicyRevisions;
  baseline_snapshots: BaselineSnapshots;
  baseline_receipts: BaselineReceipts;
  baseline_runs: BaselineRuns;
  baseline_recovery_latches: BaselineRecovery;
}
