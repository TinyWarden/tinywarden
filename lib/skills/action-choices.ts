import type {MaintenanceMenuState} from '../maintenance/contracts';
import {isPackageSkillId} from './package-types';

export type SkillActionChoice=Required<MaintenanceMenuState['actions'][number]>;
export type ActionSubject={maintenance_jobs?:{actions:MaintenanceMenuState['actions']}|undefined};
export type SkillActionTarget={host_id:string;label:string;revision:string;maintenance_jobs?:MaintenanceMenuState|undefined};
export type SkillActionOption=SkillActionChoice&{eligible:number;total:number};
export type SkillActionGroup={id:string;skill_id:string;name:string;actions:SkillActionOption[]};
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const label=(v:unknown)=>typeof v==='string'&&Array.from(v).length<=2048&&!/[<>]/.test(v)&&!v.includes('\0');
/** Wire metadata follows the admitted catalogue contract, which permits blank text. */
export function validSkillActionMetadata(v:unknown):v is SkillActionChoice{
 if(!v||typeof v!=='object'||Array.isArray(v))return false;
 const a=v as Record<string,unknown>;
 return uuid(a.id)&&uuid(a.installation_id)&&isPackageSkillId(a.skill_id)&&
  typeof a.action_id==='string'&&/^[a-z][a-z0-9_.]{1,63}$/.test(a.action_id)&&
  label(a.name)&&label(a.skill_name)&&label(a.description)&&
  typeof a.requires_approval==='boolean'&&typeof a.available==='boolean'&&(a.reason===null||typeof a.reason==='string');
}
/** Unusable display labels omit only this choice, never the surrounding Fleet read. */
export function validSkillActionChoice(v:unknown):v is SkillActionChoice{
 return validSkillActionMetadata(v)&&!!v.name.trim()&&!!v.skill_name.trim();
}
/** Preserve the explicit selection; server admission independently rechecks readiness. */
export function partitionSkillAction<T extends ActionSubject>(action:string,rows:readonly T[]){
 const eligible:T[]=[],skipped:{subject:T;reason:string}[]=[];
 for(const row of rows){const offered=row.maintenance_jobs?.actions.find(a=>a.id===action);
  if(offered?.available)eligible.push(row);else skipped.push({subject:row,reason:offered?.reason??'maintenance_agent_upgrade_required'});
 }
 return {eligible,skipped};
}
export function skillActionGroups(rows:readonly ActionSubject[]):SkillActionGroup[]{
 const choices=new Map<string,SkillActionChoice>(),conflicts=new Set<string>();
 for(const row of rows)for(const action of row.maintenance_jobs?.actions??[]){
  if(!validSkillActionChoice(action))continue;
  const old=choices.get(action.id);
  if(old&&(old.installation_id!==action.installation_id||old.skill_id!==action.skill_id||old.action_id!==action.action_id))conflicts.add(action.id);
  if(!old)choices.set(action.id,action);
 }
 const groups=new Map<string,SkillActionGroup>();
 for(const action of choices.values()){
  if(conflicts.has(action.id))continue;
  const {eligible}=partitionSkillAction(action.id,rows);if(!eligible.length)continue;
  const group=groups.get(action.installation_id)??{id:action.installation_id,skill_id:action.skill_id,name:action.skill_name,actions:[]};
  group.actions.push({...action,eligible:eligible.length,total:rows.length});groups.set(group.id,group);
 }
 return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,'en')||a.skill_id.localeCompare(b.skill_id,'en')||a.id.localeCompare(b.id));
}
