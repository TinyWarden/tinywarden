import {exactObject,uuid} from '../validation';
import {fail} from '../errors';
import {maintenanceActions,maintenanceLimits,registeredAction} from '../../lib/maintenance/policy';
import type {RecoveryAudit,RecoveryScope,RecoveryAcceptance,RecoveryFinalization} from '../../lib/maintenance/recovery';
import {canonicalMaintenance,digestText} from './validation';

function localAttempt(raw:unknown,scope:RecoveryScope){
 if(raw!==null&&uuid(raw)!==scope.apply_attempt)fail('maintenance_scope_changed',409);
 return raw as string|null;
}
function audit(raw:unknown,scope:RecoveryScope):RecoveryAudit{
 const v=exactObject(raw,['boot_id','integrity','process_running','facts']);
 if(v.integrity!=='clean'||v.process_running!==false)fail('maintenance_reconciliation_required',409);
 const definition=registeredAction(maintenanceActions,scope.action);
 if(!definition||definition.provider_version!==scope.provider_version||!definition.recovery_facts)fail('maintenance_provider_unavailable',409);
 const fields=definition.recovery_facts,values=exactObject(v.facts,Object.keys(fields));
 const facts=Object.fromEntries(Object.entries(fields).map(([key])=>[key,digestText(values[key])]));
 return {boot_id:uuid(v.boot_id),integrity:'clean',process_running:false,facts};
}
export function recoveryAcceptance(raw:unknown,scope:RecoveryScope):RecoveryAcceptance{
 const v=exactObject(raw,['schema_version','scope','local_attempt','journal_state','audit']);
 if(v.schema_version!==1||canonicalMaintenance(v.scope)!==canonicalMaintenance(scope))fail('maintenance_scope_changed',409);
 if(v.journal_state!=='present'&&v.journal_state!=='orphan_fence')fail('invalid_request',400);
 if(v.journal_state==='orphan_fence'&&v.local_attempt!==null)fail('maintenance_scope_changed',409);
 return bounded({schema_version:1,scope,local_attempt:localAttempt(v.local_attempt,scope),journal_state:v.journal_state,audit:audit(v.audit,scope)});
}
export function recoveryFinalization(raw:unknown,scope:RecoveryScope,acceptance:RecoveryAcceptance,sha:string):RecoveryFinalization{
 const v=exactObject(raw,['schema_version','recovery_id','acceptance_sha256','local_release']);
 const r=exactObject(v.local_release,['job_id','local_attempt','released','audit']);
 if(v.schema_version!==1||v.recovery_id!==scope.recovery_id||v.acceptance_sha256!==sha||r.job_id!==scope.job_id||r.released!==true||r.local_attempt!==acceptance.local_attempt)fail('maintenance_scope_changed',409);
 return bounded({schema_version:1,recovery_id:scope.recovery_id,acceptance_sha256:sha,
  local_release:{job_id:scope.job_id,local_attempt:acceptance.local_attempt,released:true,audit:audit(r.audit,scope)}});
}
function bounded<T>(v:T):T{if(Buffer.byteLength(canonicalMaintenance(v))>maintenanceLimits.controlBytes)fail('invalid_request',400);return v;}
