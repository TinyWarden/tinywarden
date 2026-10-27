/** Generic job/transport data. Action definitions come from admitted package metadata. */
export const maintenanceCapability = 'maintenance_jobs.v1';
export type MaintenanceAction = string;
export const phases = ['queued', 'preparing', 'awaiting_approval', 'approved', 'downloading', 'applying', 'verifying', 'succeeded', 'no_changes', 'blocked', 'failed', 'expired', 'cancelled'] as const;
export type MaintenancePhase = typeof phases[number];
export type MutationEffect = 'none' | 'changed' | 'indexes_changed' | 'packages_changed' | 'unknown';
export type MaintenanceScope = {host_id:string;agent_id:string;generation:number};
export type MaintenanceReadiness = {
 capability:'maintenance_jobs.v1'|'skill_actions.v1';worker_ready:boolean;
 actions:{id:MaintenanceAction;ready:boolean;missing:string[]}[];
};
export type MaintenanceMenuState={actions:{id:MaintenanceAction;available:boolean;reason:string|null;
 name?:string;installation_id?:string;action_id?:string;requires_approval?:boolean;
 skill_id?:string;skill_name?:string;description?:string}[];
 job:{id:string;operation_id:string;phase:MaintenancePhase;attention:boolean;apply_attempt:string|null;recovery_pending:boolean}|null};
export type VerificationMember = {
  installation_id:string;package_sha256:string;settings_revision:string;
  scope_sha256:string;observation_id:string;severity:'healthy'|'warning';
  subjects:{collection:string;key:string;status:'healthy'|'warning'}[];
};
export type VerificationSnapshot={policy_sha256:string;members:VerificationMember[];not_configured:string[];mode?:'local'};
export type MaintenancePlan<Provider extends object=Record<string,unknown>> = {
  provider:Provider;provider_sha256:string;verification:VerificationSnapshot;
  verification_sha256:string;
};
export type MaintenanceResult = {
  effect:MutationEffect;reason:string|null;process_running:boolean;
  local_verified:boolean;facts:Record<string,unknown>;reason_message?:import('../skills/package-types').PackageReason;
};
export type MaintenanceJob = MaintenanceScope & {
  id:string;operation_id:string;action:MaintenanceAction;phase:MaintenancePhase;
  attention:boolean;cancel_requested:boolean;apply_attempt:string|null;
  plan_sha256:string|null;created_at:string;expires_at:string;updated_at:string;
  result:MaintenanceResult|null;
};
/** Generic normalized orchestration flags, projected from package metadata. */
export type ActionDefinition<Id extends string = string> = {
  snapshot?:import('../skills/action-types').ActionSnapshot;
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
 schema_version:1|2;job_id:string|null;sequence:number;kind:MaintenanceEventKind;data:Record<string,unknown>;
 binding?:import('../skills/action-types').ActionBinding;
};
export type MaintenanceGrant={attempt_id:string;issued_at:string;expires_at:string};
export type MaintenanceDelivery={
 id:string;scope:MaintenanceScope;action:MaintenanceAction;provider_version:number;phase:MaintenancePhase;
 attention:boolean;cancel_requested:boolean;expires_at:string;plan_id:string|null;provider_sha256:string|null;
 plan_sha256:string|null;approval_id:string|null;grant:MaintenanceGrant|null;result:MaintenanceResult|null;
 binding?:import('../skills/action-types').ActionBinding;input_json?:string;settings_json?:string;archive?:{sha256:string;size:number};
};
export type MaintenanceAgentReply={schema_version:1|2;host_id:string;agent_id:string;generation:number;
 capability:'maintenance_jobs.v1'|'skill_actions.v1';server_at:string;ack_sequence:number;job:MaintenanceDelivery|null;
 probes?:import('../skills/action-types').ActionProbe[];next_probe_cursor?:string};
