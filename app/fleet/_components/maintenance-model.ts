import type {Wire} from '@/components/operator/format';
import type {readMaintenanceOperation} from '@/server/maintenance/operations';
import type {readMaintenancePlan} from '@/server/maintenance/review';
import {phases,type MaintenanceAction,type MaintenanceMenuState} from '@/lib/maintenance/contracts';
import {maintenanceActions,registeredAction,terminalMaintenance} from '@/lib/maintenance/policy';
import {messages} from '@/i18n/messages';
import type {ServerRow} from './model';

export type MaintenanceRead=Wire<Awaited<ReturnType<typeof readMaintenanceOperation>>>&{schema_version:1};
export type MaintenanceItem=MaintenanceRead['items'][number];
export type PlanRead=Wire<Awaited<ReturnType<typeof readMaintenancePlan>>>&{schema_version:1};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const count=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0;
const instant=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const nullableTime=(v:unknown)=>v===null||instant(v);
const result=(v:unknown)=>v===null||object(v)&&['none','indexes_changed','packages_changed','unknown'].includes(String(v.effect))&&typeof v.local_verified==='boolean'&&typeof v.process_running==='boolean'&&(v.reason===null||typeof v.reason==='string')&&object(v.facts)&&Object.keys(v.facts).length<=32&&Object.values(v.facts).every(f=>f===null||typeof f==='boolean'||typeof f==='number'&&Number.isSafeInteger(f)||typeof f==='string'&&f.length<=512||Array.isArray(f)&&f.length<=32&&f.every(s=>typeof s==='string'&&s.length<=288));
const summary=(v:unknown)=>v===null||object(v)&&Array.isArray(v.facts)&&v.facts.length<=16&&v.facts.every(f=>object(f)&&typeof f.key==='string'&&['bytes','count'].includes(String(f.kind))&&count(f.value))&&Array.isArray(v.tables)&&v.tables.length<=8&&v.tables.every(t=>object(t)&&typeof t.id==='string'&&count(t.count))&&['coverage','warnings','not_configured'].every(k=>count(v[k]));
export function isMaintenanceAction(value:string):value is MaintenanceAction{return !!registeredAction(maintenanceActions,value);}
export function validMaintenanceMenu(raw:unknown):raw is MaintenanceMenuState{
 if(!object(raw)||!Array.isArray(raw.actions)||raw.actions.length>8||!raw.actions.every(a=>object(a)&&typeof a.id==='string'&&isMaintenanceAction(a.id)&&typeof a.available==='boolean'&&(a.reason===null||typeof a.reason==='string')))return false;
 const j=raw.job;return j===null||object(j)&&typeof j.id==='string'&&typeof j.operation_id==='string'&&phases.includes(j.phase as typeof phases[number])&&typeof j.attention==='boolean'&&(j.apply_attempt===null||typeof j.apply_attempt==='string')&&typeof j.recovery_pending==='boolean';
}
export function validMaintenanceOperation(raw:unknown):raw is MaintenanceRead{
 if(!object(raw)||raw.schema_version!==1||!instant(raw.as_of)||!object(raw.operation)||typeof raw.operation.id!=='string'||typeof raw.operation.action!=='string'||!isMaintenanceAction(raw.operation.action)||!Array.isArray(raw.items)||raw.items.length>100)return false;
 return raw.items.every(i=>object(i)&&typeof i.host_id==='string'&&typeof i.label==='string'&&typeof i.state==='string'&&(i.job_id===null||typeof i.job_id==='string'&&typeof i.revision==='string'&&phases.includes(i.phase as typeof phases[number])&&typeof i.attention==='boolean'&&typeof i.cancel_requested==='boolean'&&typeof i.recovery_pending==='boolean')&&summary(i.review)&&result(i.result))&&Array.isArray(raw.recoveries)&&raw.recoveries.length<=100&&raw.recoveries.every(r=>object(r)&&typeof r.id==='string'&&typeof r.job_id==='string'&&instant(r.expires_at)&&nullableTime(r.revoked_at)&&nullableTime(r.accepted_at)&&nullableTime(r.finalized_at))&&Array.isArray(raw.approvals)&&raw.approvals.length<=100&&raw.approvals.every(a=>object(a)&&typeof a.id==='string'&&instant(a.created_at)&&Array.isArray(a.targets)&&a.targets.length<=100&&a.targets.every(t=>object(t)&&typeof t.job_id==='string'&&typeof t.plan_id==='string'&&typeof t.digest==='string'));
}
export function validPlanReview(raw:unknown):raw is PlanRead{
 if(!object(raw)||raw.schema_version!==1||!instant(raw.as_of)||typeof raw.id!=='string'||typeof raw.digest!=='string'||typeof raw.action!=='string'||!isMaintenanceAction(raw.action)||!instant(raw.expires_at)||typeof raw.label!=='string'||typeof raw.table!=='string'||!count(raw.total)||!count(raw.page)||raw.page_size!==25)return false;
 const coverage=raw.coverage;
 return Array.isArray(raw.rows)&&raw.rows.length<=25&&raw.rows.every(r=>object(r)&&typeof r.subject==='string'&&typeof r.context==='string'&&['before','after','state'].every(k=>r[k]===undefined||typeof r[k]==='string'))&&Array.isArray(raw.tables)&&raw.tables.length<=8&&raw.tables.every(t=>object(t)&&typeof t.id==='string'&&typeof t.label==='string'&&count(t.count)&&Array.isArray(t.columns)&&t.columns.length<=6&&t.columns.every(c=>object(c)&&['subject','context','before','after','state'].includes(String(c.key))&&typeof c.label==='string'))&&Array.isArray(raw.facts)&&raw.facts.every(f=>object(f)&&typeof f.key==='string'&&count(f.value))&&object(coverage)&&['configured','warnings','not_configured'].every(k=>count(coverage[k]));
}
export function partitionMaintenanceAction(action:MaintenanceAction,rows:ServerRow[]){
 const eligible:ServerRow[]=[],skipped:{subject:ServerRow;reason:string}[]=[];
 for(const row of rows){const available=row.maintenance_jobs?.actions.find(a=>a.id===action);if(available?.available)eligible.push(row);else skipped.push({subject:row,reason:available?.reason??'maintenance_agent_upgrade_required'});}
 return {eligible,skipped};
}
export function approvable(item:MaintenanceItem,at:string){return !!item.job_id&&item.phase==='awaiting_approval'&&!item.attention&&!item.cancel_requested&&!!item.plan_id&&!!item.digest&&!!item.review&&!!item.plan_expires_at&&Date.parse(item.plan_expires_at)>Date.parse(at);}
export function cancellable(item:MaintenanceItem){return !!item.job_id&&!!item.phase&&!terminalMaintenance(item.phase)&&!item.cancel_requested&&!item.recovery_pending;}
export function phaseLabel(item:MaintenanceItem){return item.phase?messages.maintenanceActions.phases[item.phase]:messages.maintenanceActions.skipped;}
export function maintenanceReason(reason:string|null|undefined){return reason?(messages.maintenanceActions.errors as Record<string,string>)[reason]??(messages.fleetManagement.errors as Record<string,string>)[reason]??messages.maintenanceActions.unknownFailure:'';}
export function maintenanceResultFacts(item:MaintenanceItem){
 const result=item.result;if(!result)return [];
 const packageEffects=result.effect==='packages_changed'||result.effect==='unknown'||result.process_running||item.process_running;
 return Object.entries(messages.maintenanceActions.facts).filter(([key])=>key in result.facts&&(packageEffects||result.facts[key]!==null)).map(([key,label])=>({key,label,value:result.facts[key]}));
}
export function pendingMaintenance(items:MaintenanceItem[]){return items.some(i=>!!i.phase&&!terminalMaintenance(i.phase)&&i.phase!=='awaiting_approval');}
