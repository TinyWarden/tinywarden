import {legacyMaintenanceActions} from "../../lib/maintenance/legacy";
import {exactObject,uuid} from '../validation';
import {fail} from '../errors';
import {maintenanceLimits,registeredAction} from '../../lib/maintenance/policy';
import type {RecoveryAudit,RecoveryScope,RecoveryAcceptance,RecoveryFinalization} from '../../lib/maintenance/recovery';
import {canonicalMaintenance,digestText} from './validation';
import type {ActionSnapshot} from '../../lib/skills/action-types';
import {actionValue,bytesDigest} from './action-values';

function localAttempt(raw:unknown,scope:RecoveryScope){
 if(raw!==null&&uuid(raw)!==scope.apply_attempt)fail('maintenance_scope_changed',409);
 return raw as string|null;
}
function audit(raw:unknown,scope:RecoveryScope,snapshot?:ActionSnapshot|null):RecoveryAudit{
 const v=exactObject(raw,['boot_id','integrity','process_running','facts']);
 if(v.integrity!=='clean'||v.process_running!==false)fail('maintenance_reconciliation_required',409);
 if(scope.binding){
  if(!snapshot||snapshot.descriptor_sha256!==scope.binding.descriptor_sha256)fail('maintenance_provider_unavailable',409);
  const facts=exactObject(v.facts,['json','sha256']);
  if(typeof facts.json!=='string'||bytesDigest(facts.json)!==digestText(facts.sha256))fail('maintenance_reconciliation_required',409);
  actionValue(snapshot.schemas.recovery,facts.json,65536);
  return {boot_id:uuid(v.boot_id),integrity:'clean',process_running:false,facts:{json:facts.json,sha256:String(facts.sha256)}};
 }
 const definition=registeredAction(legacyMaintenanceActions,scope.action);
 if(!definition||definition.provider_version!==scope.provider_version||!definition.recovery_facts)fail('maintenance_provider_unavailable',409);
 const fields=definition.recovery_facts,values=exactObject(v.facts,Object.keys(fields));
 const facts=Object.fromEntries(Object.entries(fields).map(([key])=>[key,digestText(values[key])]));
 return {boot_id:uuid(v.boot_id),integrity:'clean',process_running:false,facts};
}
export function recoveryAcceptance(raw:unknown,scope:RecoveryScope,snapshot?:ActionSnapshot|null):RecoveryAcceptance{
 const v=exactObject(raw,['schema_version','scope','local_attempt','journal_state','audit']);
 const version=scope.binding?2:1;
 if(v.schema_version!==version||canonicalMaintenance(v.scope)!==canonicalMaintenance(scope))fail('maintenance_scope_changed',409);
 if(v.journal_state!=='present'&&v.journal_state!=='orphan_fence')fail('invalid_request',400);
 if(v.journal_state==='orphan_fence'&&v.local_attempt!==null)fail('maintenance_scope_changed',409);
 return bounded({schema_version:version,scope,local_attempt:localAttempt(v.local_attempt,scope),journal_state:v.journal_state,audit:audit(v.audit,scope,snapshot)},scope);
}
export function recoveryFinalization(raw:unknown,scope:RecoveryScope,acceptance:RecoveryAcceptance,sha:string,snapshot?:ActionSnapshot|null):RecoveryFinalization{
 const v=exactObject(raw,['schema_version','recovery_id','acceptance_sha256','local_release']);
 const r=exactObject(v.local_release,['job_id','local_attempt','released','audit']);
 const version=scope.binding?2:1;
 if(v.schema_version!==version||v.recovery_id!==scope.recovery_id||v.acceptance_sha256!==sha||r.job_id!==scope.job_id||r.released!==true||r.local_attempt!==acceptance.local_attempt)fail('maintenance_scope_changed',409);
 return bounded({schema_version:version,recovery_id:scope.recovery_id,acceptance_sha256:sha,
  local_release:{job_id:scope.job_id,local_attempt:acceptance.local_attempt,released:true,audit:audit(r.audit,scope,snapshot)}},scope);
}
function bounded<T>(v:T,scope:RecoveryScope):T{if(Buffer.byteLength(canonicalMaintenance(v))>(scope.binding?512*1024:maintenanceLimits.controlBytes))fail('invalid_request',400);return v;}
