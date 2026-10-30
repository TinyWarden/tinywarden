import {phases,type MaintenancePhase} from './contracts';
import type {ActionProgressContext} from './presentation';
import {maintenanceRecoveryRequired,terminalMaintenance} from './policy';

/** Saved display context; never a command, readiness decision or execution grant. */
export type SkillOperationSummary={job_id:string;operation_id:string;host_id:string;installation_id:string;
 phase:MaintenancePhase;attention:boolean;recovery_pending:boolean;created_at:string;updated_at:string;
 completed_at:string|null;progress:ActionProgressContext;notice_dismissed?:boolean};
export type OperationActivityState='running'|'review'|'completed'|'failed'|'cancelled'|'verification';
export function operationActivityState(job:Pick<SkillOperationSummary,'phase'|'attention'|'recovery_pending'>):OperationActivityState{
 if(maintenanceRecoveryRequired(job))return 'verification';
 if(job.phase==='awaiting_approval')return 'review';
 if(!terminalMaintenance(job.phase))return 'running';
 return job.phase==='succeeded'||job.phase==='no_changes'?'completed':job.phase==='cancelled'?'cancelled':'failed';
}
/** Hiding a notice never changes a job or conceals active/verification work. */
export function dismissibleOperationNotice(job:Pick<SkillOperationSummary,'phase'|'attention'|'recovery_pending'>){
 return ['completed','failed','cancelled'].includes(operationActivityState(job));
}
export function validOperationSummary(v:unknown):v is SkillOperationSummary{
 if(!v||typeof v!=='object'||Array.isArray(v))return false;
 const r=v as SkillOperationSummary,instant=(t:unknown)=>typeof t==='string'&&Number.isFinite(Date.parse(t));
 return ['job_id','operation_id','host_id','installation_id'].every(k=>typeof r[k as keyof SkillOperationSummary]==='string')&&
  phases.includes(r.phase)&&typeof r.attention==='boolean'&&typeof r.recovery_pending==='boolean'&&(r.notice_dismissed===undefined||typeof r.notice_dismissed==='boolean')&&
  instant(r.created_at)&&instant(r.updated_at)&&(r.completed_at===null||instant(r.completed_at))&&
  !!r.progress&&r.progress.single===true&&typeof r.progress.server==='string'&&
  (r.progress.name===null||typeof r.progress.name==='string')&&r.progress.presentation===null;
}
