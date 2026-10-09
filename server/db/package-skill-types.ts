import type { SkillManualRuns } from "./manual-run-types";
import type { ColumnType } from "kysely";
import type { PackageMetadata, SkillSettings, PackageAssessment } from "../../lib/skills/package-types";
type Instant = ColumnType<Date, Date | string, Date | string>;
type Counter = ColumnType<string, string | number, string | number>;
export interface SkillPackages {
  content_sha256: string; skill_id: string; version: string; metadata: PackageMetadata;
  unpacked_bytes: number; official: boolean; imported_at: Instant;
}
export interface SkillInstallations {
  id: string; skill_id: string; subject_key: string; content_sha256: string; enabled: boolean;
  enablement_version: Counter; settings_revision: Counter; defaults: SkillSettings;
  grants: Record<string, unknown>[]; created_at: Instant; updated_at: Instant;
}
export interface SkillSettingsRevisions {
  installation_id: string; revision: Counter; content_sha256: string; settings: SkillSettings;
  operator_id: string; created_at: Instant;
}
export interface HostSkillPolicies {
  host_id: string; installation_id: string; version: Counter; overrides: SkillSettings; updated_at: Instant;
}
export interface HostSkillPolicyRevisions extends HostSkillPolicies { operator_id: string }
export interface SkillAssignments {
  id: string; host_id: string; agent_id: string; generation: Counter; installation_id: string;
  content_sha256: string; enablement_version: Counter; settings_revision: Counter; policy_version: Counter;
  settings: SkillSettings; grants: Record<string, unknown>[]; interval_seconds: number;
  created_at: Instant; valid_until: Instant;
}
export interface SkillObservations {
  id: string; assignment_id: string; installation_id: string; host_id: string; agent_id: string;
  generation: Counter; content_sha256: string; run_sequence: Counter; started_at: Instant;
  finished_at: Instant; received_at: Instant; evidence_expires_at: Instant;
  observation: unknown | null; outcome: string; assessments: PackageAssessment[];
  request_digest: Buffer; current: boolean;
}
export interface SkillStates {
  installation_id: string; agent_id: string; host_id: string; generation: Counter;
  content_sha256: string; enablement_version: Counter; state_version: number;
  last_sequence: Counter; finished_at: Instant; observation_id: string;
  state: unknown; updated_at: Instant;
}
export interface SkillPackageReceipts {
  agent_id: string; generation: Counter; installation_id: string; run_sequence: Counter;
  run_id: string; assignment_id: string; request_digest: Buffer; received_at: Instant; current: boolean;
}
export interface SkillPackageMutations {
  operator_id: string; request_id: string; fingerprint: Buffer;
  action: string; installation_id: string; completed_at: Instant; result: unknown;
}
export interface PackageSkillTables {
  skill_manual_runs: SkillManualRuns;
  skill_runtime_hosts: { agent_id: string; host_id: string; generation: Counter; ready: boolean; manual_runs_supported: ColumnType<boolean,boolean|undefined,boolean>; reported_at: Instant };
  skill_packages: SkillPackages; skill_installations: SkillInstallations;
  skill_settings_revisions: SkillSettingsRevisions; host_skill_policies: HostSkillPolicies;
  host_skill_policy_revisions: HostSkillPolicyRevisions; skill_assignments: SkillAssignments;
  skill_observations: SkillObservations; skill_states: SkillStates;
  skill_package_receipts: SkillPackageReceipts; skill_package_mutations: SkillPackageMutations;
}
