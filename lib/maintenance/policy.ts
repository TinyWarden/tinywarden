import {type ActionDefinition,type MaintenanceAction,type MaintenanceJob,type MaintenancePhase} from './contracts';

export const maintenanceLimits = Object.freeze({
  targets:100,events:256,prepareConcurrency:4,applyConcurrency:1,queueSeconds:86400,
  planSeconds:1800,lockWaitSeconds:30,fetchSeconds:1800,noProgressSeconds:120,
  grantSeconds:60,attentionSeconds:1800,verifySeconds:900,recoverySeconds:900,
  planRows:5000,planBytes:4*1024*1024,controlBytes:64*1024,diagnosticBytes:1024*1024,
});
const platform={os:'debian',version:'13',architecture:'amd64'} as const;
const recovery_facts={state_sha256:'sha256',selection_sha256:'sha256'} as const;
const prerequisite_packages={'apt-get':'apt','python3-apt':'python3-apt'} as const;
export const maintenanceActions = [
  {id:'packages.refresh.v1',provider_version:1,requires_approval:false,conflict_domain:'host_mutation',supported_platform:platform,recovery_facts,prerequisite_packages,prerequisites:['apt-get','python3-apt'],requires_monitoring:false,prepare_effect:'indexes_changed',result_facts:{blocked_subjects:'subjects',blocked_subject_count:'integer'}},
  {id:'packages.upgrade_conservative.v1',provider_version:1,requires_approval:true,conflict_domain:'host_mutation',supported_platform:platform,recovery_facts,prerequisite_packages,prerequisites:['apt-get','python3-apt'],requires_monitoring:true,prepare_effect:'indexes_changed',result_facts:{reboot_required:'boolean',configuration_review:'boolean',services_restart_required:'boolean',kept_back:'integer',blocked_subjects:'subjects',blocked_subject_count:'integer'}},
] as const satisfies readonly ActionDefinition<MaintenanceAction>[];

export function registeredAction<Id extends string>(registry:readonly ActionDefinition<Id>[],id:unknown){
  return typeof id==='string'?registry.find(action=>action.id===id):undefined;
}
export const terminalPhases:readonly MaintenancePhase[]=['succeeded','no_changes','blocked','failed','expired','cancelled'];
export function terminalMaintenance(phase:MaintenancePhase){return terminalPhases.includes(phase);}
export function requiresReconciliation(job:Pick<MaintenanceJob,'phase'|'attention'|'apply_attempt'>){
  return job.attention||!!job.apply_attempt&&!terminalMaintenance(job.phase);
}
/** A lease/attention timeout cannot release an uncertain native transaction. */
export function fencesHost(job:Pick<MaintenanceJob,'phase'|'attention'|'apply_attempt'>){
  return !terminalMaintenance(job.phase)||requiresReconciliation(job);
}
const next:Record<MaintenancePhase,readonly MaintenancePhase[]>={
 queued:['preparing','blocked','expired','cancelled'],
 preparing:['awaiting_approval','no_changes','succeeded','blocked','failed','expired','cancelled'],
 awaiting_approval:['approved','blocked','expired','cancelled'],
 approved:['downloading','blocked','expired','cancelled'],
 downloading:['applying','blocked','failed','expired','cancelled'],
 applying:['verifying','failed'],verifying:['succeeded','failed'],
 succeeded:[],no_changes:[],blocked:[],failed:[],expired:[],cancelled:[],
};
export function mayTransition(from:MaintenancePhase,to:MaintenancePhase){return from===to||next[from].includes(to);}
export function mayCancelImmediately(phase:MaintenancePhase){return !terminalMaintenance(phase)&&phase!=='applying'&&phase!=='verifying';}
export function nextBulkTarget(jobs:readonly Pick<MaintenanceJob,'id'|'phase'|'attention'|'cancel_requested'>[]){
  for(const job of jobs){
    if(job.attention||job.cancel_requested)return null;
    if(job.phase==='succeeded'||job.phase==='no_changes')continue;
    return job.phase==='approved'?job.id:null;
  }
  return null;
}
export type ActionReadiness={
  lifecycle:'active'|'paused'|'archived'|'deleting';recognized:boolean;
  os:string;os_version:string;architecture:string;capabilities:readonly string[];
  prerequisites:Readonly<Record<string,boolean>>;mutation_busy:boolean;
};
export function maintenanceUnavailable(action:ActionDefinition,host:ActionReadiness){
  if(host.lifecycle!=='active'&&host.lifecycle!=='paused')return 'maintenance_inactive';
  if(!host.recognized)return 'maintenance_unrecognized';
  const p=action.supported_platform;
  if(host.os!==p.os||host.os_version!==p.version||host.architecture!==p.architecture)return 'maintenance_platform';
  if(!host.capabilities.includes(action.id))return 'maintenance_agent_upgrade_required';
  if(action.prerequisites.some(name=>host.prerequisites[name]!==true))return 'maintenance_prerequisites';
  if(host.mutation_busy)return 'maintenance_busy';
  if(action.requires_monitoring&&host.lifecycle!=='active')return 'maintenance_resume_required';
  return null;
}
