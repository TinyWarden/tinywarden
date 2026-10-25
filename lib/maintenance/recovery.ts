import type {MaintenanceAction,MaintenanceScope} from './contracts';

/** Recovery is a closed receipt protocol; it never carries execution authority. */
export type RecoveryScope=MaintenanceScope&{
 recovery_id:string;job_id:string;operation_id:string;action:MaintenanceAction;provider_version:number;
 job_expires_at:string;revision:string;plan_id:string|null;provider_sha256:string|null;
 plan_sha256:string|null;approval_id:string|null;apply_attempt:string|null;
 binding?:import('../skills/action-types').ActionBinding;input_json?:string;settings_json?:string;archive?:{sha256:string;size:number};
};
export type RecoveryAudit={boot_id:string;integrity:'clean';process_running:false;facts:Record<string,string>};
export type RecoveryAcceptance={schema_version:1|2;scope:RecoveryScope;local_attempt:string|null;
 journal_state:'present'|'orphan_fence';audit:RecoveryAudit};
export type RecoveryFinalization={schema_version:1|2;recovery_id:string;acceptance_sha256:string;
 local_release:{job_id:string;local_attempt:string|null;released:true;audit:RecoveryAudit}};
export type RecoveryReply={schema_version:1|2;recovery_id:string;scope:RecoveryScope;expires_at:string;
 state:'issued'|'accepted'|'finalized';acceptance_sha256:string|null;finalization_sha256:string|null};
