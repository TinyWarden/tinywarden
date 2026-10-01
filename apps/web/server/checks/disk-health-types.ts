export type DiskHealthState = "healthy" | "warning" | "critical" | "unknown" | "stale";
export interface MountHistory {
  mount_id: number; mount_path: string; mount_root: string; filesystem_type: string;
  kind: string; writable: boolean; shared_capacity: boolean; reason: string;
  total_bytes: string | null; free_bytes: string | null; available_bytes: string | null;
  classification: string;
}
export interface RunHistory {
  run_id: string; sequence: number; assignment_id: string; received_at: string;
  started_at: string; finished_at: string; coverage: string; reason: string;
  excluded_kernel: number; excluded_remote: number; dropped_runs: number;
  classification: string; warning_percent: number; critical_percent: number;
  definition_revision: number; policy_version: number; mode: string;
  mounts: MountHistory[];
}
