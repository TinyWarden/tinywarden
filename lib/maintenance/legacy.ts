/** Read-only contracts for pre-SDK3 history/recovery. Never authorize new work. */
import type {ActionDefinition,MaintenanceAction} from "./contracts";
const platform={os:'debian',version:'13',architecture:'amd64'} as const;
const recovery_facts={state_sha256:'sha256',selection_sha256:'sha256'} as const;
const prerequisite_packages={'apt-get':'apt','python3-apt':'python3-apt'} as const;
export const legacyMaintenanceActions = [
  {id:'packages.refresh.v1',provider_version:1,requires_approval:false,conflict_domain:'host_mutation',supported_platform:platform,recovery_facts,prerequisite_packages,prerequisites:['apt-get','python3-apt'],requires_monitoring:false,prepare_effect:'indexes_changed',result_facts:{blocked_subjects:'subjects',blocked_subject_count:'integer'}},
  {id:'packages.upgrade_conservative.v1',provider_version:1,requires_approval:true,conflict_domain:'host_mutation',supported_platform:platform,recovery_facts,prerequisite_packages,prerequisites:['apt-get','python3-apt'],requires_monitoring:true,prepare_effect:'indexes_changed',result_facts:{reboot_required:'boolean',configuration_review:'boolean',services_restart_required:'boolean',kept_back:'integer',blocked_subjects:'subjects',blocked_subject_count:'integer'}},
] as const satisfies readonly ActionDefinition<MaintenanceAction>[];
