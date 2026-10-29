import type {Wire} from '@/components/operator/format';
import type {readMaintenanceOperation} from '@/server/maintenance/operations';
import type {readMaintenancePlan} from '@/server/maintenance/review';
import {phases,type MaintenanceAction,type MaintenanceMenuState} from '@/lib/maintenance/contracts';
import {terminalMaintenance} from '@/lib/maintenance/policy';
import {messages} from '@/i18n/messages';
import type {ServerRow} from './model';
import {partitionSkillAction,validSkillActionMetadata} from '@/lib/skills/action-choices';
import type {ActionProgressContext} from '@/lib/maintenance/presentation';

export type MaintenanceRead=Wire<Awaited<ReturnType<typeof readMaintenanceOperation>>>&{schema_version:1};
export type MaintenanceItem=MaintenanceRead['items'][number];
export type PlanRead=Wire<Awaited<ReturnType<typeof readMaintenancePlan>>>&{schema_version:1};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const count=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0;
const instant=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const nullableTime=(v:unknown)=>v===null||instant(v);
const scalar=(v:unknown)=>v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&v.length<=65536;
export function validProgressContext(v:unknown):v is ActionProgressContext{
 if(!object(v)||(v.name!==null&&(typeof v.name!=='string'||v.name.length>2048))||typeof v.single!=='boolean'||(v.server!==null&&(typeof v.server!=='string'||v.server.length>2048)))return false;
 const p=v.presentation;
 return p===null||object(p)&&typeof p.name==='string'&&typeof p.description==='string'&&typeof p.requires_approval==='boolean'&&Array.isArray(p.facts)&&p.facts.length<=64&&p.facts.every(f=>object(f)&&typeof f.key==='string'&&typeof f.label==='string'&&typeof f.kind==='string')&&(p.reason===null||typeof p.reason==='string');
}
const result=(v:unknown)=>v===null||object(v)&&['none','changed','indexes_changed','packages_changed','unknown'].includes(String(v.effect))&&typeof v.local_verified==='boolean'&&typeof v.process_running==='boolean'&&(v.reason===null||typeof v.reason==='string')&&object(v.facts)&&Object.keys(v.facts).length<=64;
const summary=(v:unknown)=>v===null||object(v)&&Array.isArray(v.facts)&&v.facts.length<=8&&v.facts.every(f=>object(f)&&typeof f.key==='string'&&['bytes','count','text','number','boolean','sha256'].includes(String(f.kind))&&scalar(f.value))&&Array.isArray(v.tables)&&v.tables.length<=8&&v.tables.every(t=>object(t)&&typeof t.id==='string'&&count(t.count))&&['coverage','warnings','not_configured'].every(k=>count(v[k]));
const validActionId=(v:unknown)=>typeof v==='string'&&/^[a-z][a-z0-9_.]{1,63}$/.test(v);
export function isMaintenanceAction(value:string){return /^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(value)||/^[a-z][a-z0-9_]*\.[a-z0-9_.]+$/.test(value);}
export function validMaintenanceMenu(raw:unknown):raw is MaintenanceMenuState{
 if(!object(raw)||!Array.isArray(raw.actions)||raw.actions.length>1600||!raw.actions.every(validSkillActionMetadata)||new Set(raw.actions.map(a=>a.id)).size!==raw.actions.length)return false;
 const j=raw.job;return j===null||object(j)&&typeof j.id==='string'&&typeof j.operation_id==='string'&&phases.includes(j.phase as typeof phases[number])&&typeof j.attention==='boolean'&&(j.apply_attempt===null||typeof j.apply_attempt==='string')&&typeof j.recovery_pending==='boolean'&&(j.installation_id===undefined||j.installation_id===null||typeof j.installation_id==='string')&&(j.progress===undefined||validProgressContext(j.progress));
}
export function validMaintenanceOperation(raw:unknown):raw is MaintenanceRead{
 if(!object(raw)||raw.schema_version!==1||!instant(raw.as_of)||!object(raw.operation)||typeof raw.operation.id!=='string'||typeof raw.operation.action!=='string'||!validActionId(raw.operation.action)||!Array.isArray(raw.items)||raw.items.length>100)return false;
 return raw.items.every(i=>object(i)&&typeof i.host_id==='string'&&typeof i.label==='string'&&typeof i.state==='string'&&(i.job_id===null||typeof i.job_id==='string'&&typeof i.revision==='string'&&phases.includes(i.phase as typeof phases[number])&&typeof i.attention==='boolean'&&typeof i.cancel_requested==='boolean'&&typeof i.recovery_pending==='boolean')&&summary(i.review)&&result(i.result))&&Array.isArray(raw.recoveries)&&raw.recoveries.length<=100&&raw.recoveries.every(r=>object(r)&&typeof r.id==='string'&&typeof r.job_id==='string'&&instant(r.expires_at)&&nullableTime(r.revoked_at)&&nullableTime(r.accepted_at)&&nullableTime(r.finalized_at))&&Array.isArray(raw.approvals)&&raw.approvals.length<=100&&raw.approvals.every(a=>object(a)&&typeof a.id==='string'&&instant(a.created_at)&&Array.isArray(a.targets)&&a.targets.length<=100&&a.targets.every(t=>object(t)&&typeof t.job_id==='string'&&typeof t.plan_id==='string'&&typeof t.digest==='string'));
}
export function validPlanReview(raw:unknown):raw is PlanRead{
 if(!object(raw)||raw.schema_version!==1||!instant(raw.as_of)||typeof raw.id!=='string'||typeof raw.digest!=='string'||typeof raw.action!=='string'||!validActionId(raw.action)||!instant(raw.expires_at)||typeof raw.label!=='string'||typeof raw.table!=='string'||!count(raw.total)||!count(raw.page)||raw.page_size!==25)return false;
 const coverage=raw.coverage;
 return Array.isArray(raw.rows)&&raw.rows.length<=25&&raw.rows.every(r=>object(r)&&Object.keys(r).length<=8&&Object.values(r).every(scalar))&&Array.isArray(raw.tables)&&raw.tables.length<=9&&raw.tables.every(t=>object(t)&&typeof t.id==='string'&&typeof t.label==='string'&&count(t.count)&&Array.isArray(t.columns)&&t.columns.length<=8&&t.columns.every(c=>object(c)&&typeof c.key==='string'&&typeof c.label==='string'))&&Array.isArray(raw.facts)&&raw.facts.length<=8&&raw.facts.every(f=>object(f)&&typeof f.key==='string'&&scalar(f.value))&&object(coverage)&&['configured','warnings','not_configured'].every(k=>count(coverage[k]));
}
export function partitionMaintenanceAction(action:MaintenanceAction,rows:ServerRow[]){
 return partitionSkillAction(action,rows);
}
export function approvable(item:MaintenanceItem,at:string){return !!item.job_id&&item.phase==='awaiting_approval'&&!item.attention&&!item.cancel_requested&&!!item.plan_id&&!!item.digest&&!!item.review&&!!item.plan_expires_at&&Date.parse(item.plan_expires_at)>Date.parse(at);}
export type ReviewedPlan=Pick<PlanRead,'id'|'digest'|'job_id'|'host_id'|'operation_id'|'expires_at'>;
/** A rendered plan may authorize only its matching current operation, host and job. */
export function reviewedApproval(item:MaintenanceItem,plan:ReviewedPlan|null,operation:string,at:string){
 return !!plan&&approvable(item,at)&&plan.operation_id===operation&&plan.host_id===item.host_id&&plan.job_id===item.job_id&&plan.id===item.plan_id&&plan.digest===item.digest&&Date.parse(plan.expires_at)>Date.parse(at);
}
export function cancellable(item:MaintenanceItem){return !!item.job_id&&!!item.phase&&!terminalMaintenance(item.phase)&&!item.cancel_requested&&!item.recovery_pending;}
export function phaseLabel(item:MaintenanceItem){return item.phase?messages.maintenanceActions.phases[item.phase]:messages.maintenanceActions.skipped;}
export function maintenanceReason(reason:string|null|undefined){return reason?(messages.maintenanceActions.errors as Record<string,string>)[reason]??(messages.fleetManagement.errors as Record<string,string>)[reason]??messages.maintenanceActions.unknownFailure:'';}
export function maintenanceResultFacts(item:MaintenanceItem){
 const result=item.result;if(!result)return [];
 if(item.presentation){
  const preparationOnly=!item.apply_attempt&&!item.process_running&&!result.process_running&&result.effect!=='unknown'&&result.effect!=='packages_changed';
  return item.presentation.facts.map(f=>({...f,value:result.facts[f.key]})).filter(f=>!preparationOnly||f.value!==null&&f.value!==undefined);
 }
 const packageEffects=result.effect==='packages_changed'||result.effect==='unknown'||result.process_running||item.process_running;
 return Object.entries(messages.maintenanceActions.facts).filter(([key])=>key in result.facts&&(packageEffects||result.facts[key]!==null)).map(([key,label])=>({key,label,value:result.facts[key]}));
}
export function pendingMaintenance(items:MaintenanceItem[]){return items.some(i=>!!i.phase&&!terminalMaintenance(i.phase)&&i.phase!=='awaiting_approval');}
export function maintenanceSettled(v:MaintenanceRead|null){
 return !!v&&v.items.length>0&&v.items.every(i=>i.state!=='pending'&&!i.attention&&!i.recovery_pending&&!i.process_running&&!i.result?.process_running&&(!i.job_id||!!i.phase&&terminalMaintenance(i.phase)));
}
export const maintenanceInterval=(v:MaintenanceRead|null)=>maintenanceSettled(v)?Infinity:2000;
