import type {MaintenanceJobRow} from './authority';
import type {VerificationSnapshot} from '../../lib/maintenance/contracts';
import {fail} from '../errors';
import {maintenanceDigest} from './validation';

/** Execution evidence belongs to this exact action and target, never monitoring. */
export function localVerificationSnapshot(job:MaintenanceJobRow):VerificationSnapshot{
 if(!job.action_binding)fail('maintenance_legacy_recovery_required',409);
 return {mode:'local',policy_sha256:maintenanceDigest({binding:job.action_binding,
  authority:{enablement_version:job.action_enablement_version,monitoring_epoch:job.action_monitoring_epoch},
  scope:{host_id:job.host_id,agent_id:job.agent_id,generation:Number(job.generation)}}),members:[],not_configured:[]};
}
export function sameVerificationCoverage(a:VerificationSnapshot,b:VerificationSnapshot){
 return a.mode==='local'&&b.mode==='local'&&a.policy_sha256===b.policy_sha256&&
  a.members.length===0&&b.members.length===0&&a.not_configured.length===0&&b.not_configured.length===0;
}
export function assertVerificationCoverage(job:MaintenanceJobRow,baseline:VerificationSnapshot){
 if(!sameVerificationCoverage(baseline,localVerificationSnapshot(job)))fail('maintenance_scope_changed',409);
 return baseline;
}
