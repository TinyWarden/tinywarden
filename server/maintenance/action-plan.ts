import type {ActionSnapshot} from '../../lib/skills/action-types';
import type {MaintenanceResult} from '../../lib/maintenance/contracts';
import {inspectActionJSON} from '../../lib/skills/action-json';
import {exactObject} from '../validation';
import {fail} from '../errors';
import {actionValue} from './action-values';

/** Domain bytes stay opaque and hashed; schemas supply their review structure. */
export function admittedActionPlan(snapshot:ActionSnapshot,raw:string){
 const parsed=inspectActionJSON(raw,4*1024*1024),v=exactObject(parsed.value,['has_changes','plan','no_changes_result']);
 if(typeof v.has_changes!=='boolean'||v.has_changes&&v.no_changes_result!==null||!v.has_changes&&v.no_changes_result===null)fail('maintenance_plan_changed',409);
 const plan=actionValue(snapshot.schemas.plan,parsed.fields.plan!);
 let result:MaintenanceResult|undefined;
 if(v.no_changes_result!==null){
  const r=exactObject(v.no_changes_result,['effect','reason','local_verified','process_running','facts','receipt_json']);
  if(!['none','changed'].includes(String(r.effect))||r.reason!==null||r.local_verified!==true||r.process_running!==false)fail('maintenance_result_invalid',409);
  if(r.receipt_json!==null){if(typeof r.receipt_json!=='string')fail('maintenance_result_invalid',409);inspectActionJSON(r.receipt_json,65536);}
  const rawResult=inspectActionJSON(parsed.fields.no_changes_result!,65536);
  const facts=actionValue(snapshot.schemas.result,rawResult.fields.facts!,65536);
  result={effect:r.effect as MaintenanceResult['effect'],reason:null,local_verified:true,process_running:false,facts};
 }
 return {plan,has_changes:v.has_changes,no_changes_result:result,provider_json:raw};
}
