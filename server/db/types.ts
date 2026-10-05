import type { SkillControl, SkillEnablementReceipts } from "./skill-types";
import type { HistoryTables } from "./history-types";
import type { ColumnType } from "kysely";
import type { NotificationTables } from "./notification-types";
import type { BaselineTables } from "./baseline-types";
import type { PackageSkillTables } from "./package-skill-types";

type Instant = ColumnType<Date, Date | string, Date | string>;
type Digest = ColumnType<Buffer, Buffer, Buffer>;
type BigIntText = ColumnType<string, string | number, string | number>;

export interface Operators {
  id: string;
  singleton: boolean;
  login: string;
  password_algorithm: string;
  password_n: number;
  password_r: number;
  password_p: number;
  password_salt: Buffer;
  password_hash: Buffer;
  auth_version: BigIntText;
  created_at: Instant;
  password_changed_at: Instant;
}

export interface LoginThrottle {
  singleton: boolean;
  window_started_at: Instant;
  attempts: number;
}

export interface OperatorSessions {
  id: string;
  operator_id: string;
  secret_digest: Digest;
  auth_version: BigIntText;
  issued_at: Instant;
  last_seen_at: Instant;
  expires_at: Instant;
}

export interface Hosts {
  id: string;
  label: string;
  reported_hostname: string;
  os_id: string;
  os_version: string;
  architecture: string;
  enrolled_agent_version: string;
  created_at: Instant;
}

export interface Agents {
  id: string;
  host_id: string;
  current_generation: BigIntText;
  enrolled_at: Instant;
  revoked_at: Instant | null;
  heartbeat_interval_seconds: number;
  stale_after_seconds: number;
}

export interface AgentCredentials {
  id: string;
  agent_id: string;
  generation: BigIntText;
  secret_digest: Digest;
  created_at: Instant;
  revoked_at: Instant | null;
  last_sequence: BigIntText;
  last_fingerprint: Digest | null;
  accepted_at: Instant | null;
  sent_at: Instant | null;
  agent_version: string | null;
}

export interface EnrollmentTokens {
  id: string;
  secret_digest: Digest;
  issued_by: string;
  issuance_request_id: string;
  issuance_fingerprint: Digest;
  label: string;
  target_agent_id: string | null;
  expected_generation: BigIntText | null;
  issued_at: Instant;
  expires_at: Instant;
  revoked_at: Instant | null;
  consumed_at: Instant | null;
  consumed_request_id: string | null;
  consumed_fingerprint: Digest | null;
  consumed_credential_id: string | null;
}

export interface AuditEvents {
  notification_route: string | null; notification_event: string | null;
  notification_attempt: string | null; notification_outcome: string | null;
  id: string;
  occurred_at: Instant;
  action: string;
  actor_kind: string;
  operator_id: string | null;
  target_operator_id: string | null;
  agent_id: string | null;
  target_agent_id: string | null;
  host_id: string | null;
  token_id: string | null;
  correlation_id: string;
  from_generation: BigIntText | null;
  to_generation: BigIntText | null;
  revoked: boolean | null;
  definition_key: string | null;
  from_definition_revision: BigIntText | null;
  to_definition_revision: BigIntText | null;
  from_policy_version: BigIntText | null;
  to_policy_version: BigIntText | null;
  baseline_key: string | null;
  from_baseline_revision: BigIntText | null;
  to_baseline_revision: BigIntText | null;
  from_baseline_policy: BigIntText | null;
  to_baseline_policy: BigIntText | null;
  retention_family: string | null;
  retention_cutoff: Instant | null;
  retention_days: number | null;
  retention_parent_count: number | null;
  retention_mount_count: number | null;
}

export interface RunReceipt {
  id: string; host_id: string; agent_id: string; generation: BigIntText;
  run_sequence: BigIntText; assignment_id: string; received_at: Instant; request_digest: Digest;
}

export interface CheckDefinitions extends SkillControl {
  definition_key: string; kind: string; current_revision: BigIntText;
}
export interface CheckDefinitionRevisions {
  definition_key: string; revision: BigIntText; warning_percent: number;
  critical_percent: number; interval_seconds: number; selector_version: number;
  evaluator_version: number; created_at: Instant;
}
export interface HostCheckPolicies {
  host_id: string; definition_key: string; current_policy_version: BigIntText;
  last_delivery_revision: BigIntText;
}
export interface HostCheckPolicyRevisions {
  override_fields: ColumnType<string[] | null, string[] | null | undefined, string[] | null>;
  host_id: string; definition_key: string; version: BigIntText;
  mode: string; warning_percent: number | null; critical_percent: number | null;
  interval_seconds: number | null; pinned_definition_revision: BigIntText | null;
  created_at: Instant;
}
export interface CheckAssignmentSnapshots {
  id: string; host_id: string; definition_key: string; agent_id: string;
  generation: BigIntText; revision: BigIntText; definition_revision: BigIntText;
  policy_version: BigIntText; mode: string; applicability: string;
  enablement_version: ColumnType<string, string | number | undefined, string | number>;
  warning_percent: number; critical_percent: number; interval_seconds: number;
  selector_version: number; evaluator_version: number; created_at: Instant;
  payload_digest: Digest;
}
export interface CheckMutationReceipts {
  operator_id: string; request_id: string; root: string; definition_key: string;
  host_id: string | null; request_fingerprint: Digest; changed: boolean;
  resulting_definition_revision: BigIntText | null;
  resulting_policy_version: BigIntText | null; completed_at: Instant;
}
export interface DiskRuns {
  id: string; host_id: string; agent_id: string; generation: BigIntText;
  run_sequence: BigIntText; assignment_id: string; started_at: Instant;
  finished_at: Instant; received_at: Instant; coverage: string; reason: string;
  excluded_kernel: number; excluded_remote: number; dropped_runs: BigIntText;
  request_digest: Digest; worst_classification: string;
}
export interface DiskRunMounts {
  run_id: string; mount_id: number; mount_path: string; mount_root: string;
  filesystem_type: string; kind: string; writable: boolean; shared_capacity: boolean;
  reason: string; total_bytes: string | null; free_bytes: string | null;
  available_bytes: string | null; classification: string;
}
export interface DiskRecoveryLatches {
  agent_id: string; generation: BigIntText; host_id: string;
  reason: string; latched_at: Instant;
}

export interface Database extends BaselineTables, NotificationTables, HistoryTables, PackageSkillTables {
  skill_enablement_receipts: SkillEnablementReceipts;
  operators: Operators;
  login_throttle: LoginThrottle;
  operator_sessions: OperatorSessions;
  hosts: Hosts;
  agents: Agents;
  agent_credentials: AgentCredentials;
  enrollment_tokens: EnrollmentTokens;
  audit_events: AuditEvents;
  check_definitions: CheckDefinitions;
  check_definition_revisions: CheckDefinitionRevisions;
  host_check_policies: HostCheckPolicies;
  host_check_policy_revisions: HostCheckPolicyRevisions;
  check_assignment_snapshots: CheckAssignmentSnapshots;
  check_mutation_receipts: CheckMutationReceipts;
  disk_runs: DiskRuns;
  disk_run_receipts: RunReceipt;
  baseline_run_receipts: RunReceipt & { definition_key: string };
  disk_run_mounts: DiskRunMounts;
  disk_recovery_latches: DiskRecoveryLatches;
}
