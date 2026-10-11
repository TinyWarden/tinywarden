export type UpdateOutcome="idle"|"checking"|"disabled"|"available"|"installing"|"awaiting_confirmation"|"updated"|"failed"|"manual_required"|"app_required";
export interface UpdaterStatus {outcome:UpdateOutcome;checked_at?:string;updated_at?:string;target?:string;error?:string}
export interface PlatformObservation {
  version:string;managed:boolean;binary_sha256:string;runtime_sha256:string;descriptor_sha256:string;
  installed_version:string;local_automatic:boolean;updater:UpdaterStatus;
}
export type MaintenanceState="current"|"available"|"updating"|"confirming"|"failed"|"manual"|"unavailable"|"app_required"|"manual_required"|"unrecognized";
export interface AgentMaintenance {
  state:MaintenanceState;running_version:string;available_version:string|null;newest_version:string|null;
  observed_at:string|null;catalog_at:string|null;checked_at:string|null;updated_at:string|null;
  local_automatic:boolean|null;automatic:boolean;override:boolean|null;revision:string;default_revision:string;
}
