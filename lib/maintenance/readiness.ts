import {maintenanceActions,registeredAction} from './policy';
import type {MaintenanceAction} from './contracts';

export const readinessStates=['ready','unknown','stale','catalog_unavailable','unrecognized','unsupported_agent','worker_unavailable','missing_prerequisites','platform_unsupported','inactive','busy','monitoring_paused'] as const;
export type ActionReadinessState=typeof readinessStates[number];
export type ActionReadinessDetails={observed_at:string|null;valid_until:string|null;
 actions:{id:MaintenanceAction;state:ActionReadinessState;missing_packages:string[]}[]};
export function validActionReadiness(raw:unknown):raw is ActionReadinessDetails{
 if(!raw||typeof raw!=='object')return false;
 const v=raw as ActionReadinessDetails;
 const instant=(x:unknown)=>x===null||typeof x==='string'&&x.length<=35&&Number.isFinite(Date.parse(x));
 if(!instant(v.observed_at)||!instant(v.valid_until)||!Array.isArray(v.actions)||v.actions.length!==maintenanceActions.length)return false;
 return new Set(v.actions.map(a=>a?.id)).size===v.actions.length&&v.actions.every(a=>{
  const definition=a&&registeredAction(maintenanceActions,a.id);
  const packages:readonly string[]=definition?Object.values(definition.prerequisite_packages??{}):[];
  return !!definition&&readinessStates.includes(a.state)&&Array.isArray(a.missing_packages)&&a.missing_packages.length<=8&&
   new Set(a.missing_packages).size===a.missing_packages.length&&a.missing_packages.every(p=>packages.includes(p))&&
   (a.state==='missing_prerequisites'?a.missing_packages.length>0:a.missing_packages.length===0);
 });
}
