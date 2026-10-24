/** Versioned maintenance data; monitoring skills cannot register privileged actions. */
export const maintenanceCapability = 'maintenance_jobs.v1';
export const packageActions = ['packages.refresh.v1', 'packages.upgrade_conservative.v1'] as const;
export type MaintenanceAction = typeof packageActions[number];
export const phases = ['queued', 'preparing', 'awaiting_approval', 'approved', 'downloading', 'applying', 'verifying', 'succeeded', 'no_changes', 'blocked', 'failed', 'expired', 'cancelled'] as const;
export type MaintenancePhase = typeof phases[number];
export type MutationEffect = 'none' | 'indexes_changed' | 'packages_changed' | 'unknown';
export type MaintenanceScope = {host_id:string;agent_id:string;generation:number};
export type MaintenanceReadiness = {
 capability:'maintenance_jobs.v1';worker_ready:boolean;
 actions:{id:MaintenanceAction;ready:boolean;missing:string[]}[];
};
export type MaintenanceMenuState={actions:{id:MaintenanceAction;available:boolean;reason:string|null}[];
 job:{id:string;operation_id:string;phase:MaintenancePhase;attention:boolean;apply_attempt:string|null;recovery_pending:boolean}|null};
export type PackageChange = {
  name:string;architecture:string;installed_version:string;candidate_version:string;
  archive_sha256:string;archive_bytes:number;installed_bytes:number;
};
export type VerificationMember = {
  installation_id:string;package_sha256:string;settings_revision:string;
  scope_sha256:string;observation_id:string;severity:'healthy'|'warning';
  subjects:{collection:string;key:string;status:'healthy'|'warning'}[];
};
export type VerificationSnapshot={policy_sha256:string;members:VerificationMember[];not_configured:string[]};
export type UpgradePlan = {
  schema_version:1;action:'packages.upgrade_conservative.v1';provider_version:1;
  policy_sha256:string;state_sha256:string;sources_sha256:string;indexes_sha256:string;
  config_sha256:string;selection_sha256:string;local_sha256:string;
  packages:PackageChange[];kept_back:{name:string;architecture:string;held:boolean}[];
  download_bytes:number;unpacked_bytes:number;
};
export type MaintenancePlan<Provider extends object=UpgradePlan> = {
  provider:Provider;provider_sha256:string;verification:VerificationSnapshot;
  verification_sha256:string;
};
export type MaintenanceResult = {
  effect:MutationEffect;reason:string|null;process_running:boolean;
  local_verified:boolean;facts:Record<string,boolean|number|string|string[]|null>;
};
export type MaintenanceJob = MaintenanceScope & {
  id:string;operation_id:string;action:MaintenanceAction;phase:MaintenancePhase;
  attention:boolean;cancel_requested:boolean;apply_attempt:string|null;
  plan_sha256:string|null;created_at:string;expires_at:string;updated_at:string;
  result:MaintenanceResult|null;
};
/** Provider metadata is built into reviewed app/agent source, never skill metadata. */
export type ActionDefinition<Id extends string = string> = {
  id:Id;provider_version:number;requires_approval:boolean;
  conflict_domain:'host_mutation';supported_platform:{os:'debian';version:'13';architecture:'amd64'};
  prerequisites:readonly string[];requires_monitoring:boolean;
  prerequisite_packages?:Readonly<Record<string,string>>;
  prepare_effect?:MutationEffect;
  result_facts?:Readonly<Record<string,'boolean'|'integer'|'subjects'>>;
  recovery_facts?:Readonly<Record<string,'sha256'>>;
};

export const maintenanceEventKinds=['poll','preparing','prepared','plan_chunk','downloading','ready','verifying','completed','failed','cancelled','start_declined','reconciled'] as const;
export type MaintenanceEventKind=typeof maintenanceEventKinds[number];
export type MaintenanceAgentRequest=MaintenanceScope&{
 schema_version:1;job_id:string|null;sequence:number;kind:MaintenanceEventKind;data:Record<string,unknown>;
};
export type MaintenanceGrant={attempt_id:string;issued_at:string;expires_at:string};
export type MaintenanceDelivery={
 id:string;scope:MaintenanceScope;action:MaintenanceAction;provider_version:number;phase:MaintenancePhase;
 attention:boolean;cancel_requested:boolean;expires_at:string;plan_id:string|null;provider_sha256:string|null;
 plan_sha256:string|null;approval_id:string|null;grant:MaintenanceGrant|null;result:MaintenanceResult|null;
};
export type MaintenanceAgentReply={schema_version:1;host_id:string;agent_id:string;generation:number;
 capability:'maintenance_jobs.v1';server_at:string;ack_sequence:number;job:MaintenanceDelivery|null};
