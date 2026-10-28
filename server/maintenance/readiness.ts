import type {Selectable,Transaction} from 'kysely';
import type {Database,Hosts} from '../db/types';
import type {MaintenanceReadiness,MaintenanceMenuState} from '../../lib/maintenance/contracts';
import {terminalPhases,maintenanceUnavailable} from '../../lib/maintenance/policy';
import type {ActionDefinition} from '../../lib/maintenance/contracts';
import {grantedActions} from './package-actions';
import {exactObject} from '../validation';
import {fail} from '../errors';
import {compare,validVersion} from '../agent-updates/release';
import {readCatalog,freshCatalog} from '../agent-updates/catalog';
import {activeAgentUpdate,activeUpdateStates} from '../agent-updates/requests';
import {activeMaintenance} from './fencing';
import type {ActionReadinessDetails,ActionReadinessState} from '../../lib/maintenance/readiness';

export function validateMaintenanceReadiness(raw:unknown):MaintenanceReadiness{
 const v=exactObject(raw,['capability','worker_ready','actions']);
 if(!['maintenance_jobs.v1','skill_actions.v1'].includes(String(v.capability))||typeof v.worker_ready!=='boolean'||!Array.isArray(v.actions)||v.actions.length>8||v.capability==='skill_actions.v1'&&v.actions.length)fail('invalid_request',400);
 const actions=v.actions.map(raw=>{
  const item=exactObject(raw,['id','ready','missing']);
  if(typeof item.id!=='string'||!/^[a-z][a-z0-9_.]{1,63}$/.test(item.id)||typeof item.ready!=='boolean'||!Array.isArray(item.missing)||item.missing.length>16||item.missing.some(p=>typeof p!=='string'||!/^[A-Za-z0-9_.+-]{1,128}$/.test(p))||item.ready!==(item.missing.length===0))fail('invalid_request',400);
  return {id:item.id,ready:item.ready,missing:item.missing as string[]};
 });
 if(new Set(actions.map(a=>a.id)).size!==actions.length)fail('invalid_request',400);
 return {capability:v.capability as MaintenanceReadiness['capability'],worker_ready:v.worker_ready,actions};
}
function readinessReports(trx:Transaction<Database>,ids:string[]){return trx.selectFrom('agents as a').leftJoin('agent_platform_reports as r',j=>j.onRef('r.agent_id','=','a.id').onRef('r.generation','=','a.current_generation'))
 .select(['a.id','a.host_id','a.current_generation','a.stale_after_seconds','r.observation','r.observed_at']).where('a.host_id','in',ids).where('a.revoked_at','is',null).execute();}
type Report=Awaited<ReturnType<typeof readinessReports>>[number];
export async function maintenanceExecutionIdentity(trx:Transaction<Database>,host:string,agent:string,generation:string,at:Date){
 const row=(await readinessReports(trx,[host])).find(r=>r.id===agent&&r.current_generation===generation),o=row?.observation,catalog=await readCatalog(trx);
 const known=freshCatalog(catalog,at)&&catalog.releases.find(r=>r.metadata.version===o?.version)?.metadata;
 return !!(row?.observed_at&&row.observed_at<=at&&+at-+row.observed_at<=Number(row.stale_after_seconds)*1000&&known&&o?.managed&&o.installed_version===o.version&&known.binary_sha256===o.binary_sha256&&known.runtime_sha256===o.runtime_sha256&&known.descriptor_sha256===o.descriptor_sha256);
}
/** Only pre-cutover jobs use this historical protocol; no new work can select it. */
export async function legacyActionReadiness(trx:Transaction<Database>,host:Selectable<Hosts>,definition:ActionDefinition,at:Date,ownJob:string){
 const {row,catalog,busy}=await readinessContext(trx,host,at,ownJob),o=row?.observation;
 const known=freshCatalog(catalog,at)&&catalog.releases.find(r=>r.metadata.version===o?.version)?.metadata;
 const current=!!row?.observed_at&&row.observed_at<=at&&+at-+row.observed_at<=Number(row.stale_after_seconds)*1000;
 const recognized=!!(current&&known&&o?.managed&&o.installed_version===o.version&&known.binary_sha256===o.binary_sha256&&known.runtime_sha256===o.runtime_sha256&&known.descriptor_sha256===o.descriptor_sha256);
 const report=o?.maintenance?.capability==='maintenance_jobs.v1'?o.maintenance.actions.find(a=>a.id===definition.id):undefined;
 return maintenanceUnavailable(definition,{lifecycle:host.lifecycle,recognized,os:host.os_id,os_version:host.os_version,architecture:host.architecture,
  mutation_busy:busy,capabilities:o?.maintenance?.worker_ready&&report?[definition.id]:[],prerequisites:Object.fromEntries(definition.prerequisites.map(p=>[p,!!report&&!report.missing.includes(p)]))});
}
type Choices=Awaited<ReturnType<typeof grantedActions>>;
async function actionReports(trx:Transaction<Database>,agent:string|undefined){
 if(!agent)return {worker:undefined,reports:[]};
 const worker=await trx.selectFrom('agent_action_workers').selectAll().where('agent_id','=',agent).executeTakeFirst();
 const reports=await trx.selectFrom('agent_action_readiness').selectAll().where('agent_id','=',agent).execute();
 return {worker,reports};
}
function availableActions(host:Selectable<Hosts>,row:Report|undefined,catalog:Awaited<ReturnType<typeof readCatalog>>,busy:boolean,at:Date,choices:Choices,evidence:Awaited<ReturnType<typeof actionReports>>){
 const o=row?.observation,known=freshCatalog(catalog,at)&&catalog.releases.find(r=>r.metadata.version===o?.version)?.metadata;
 const current=!!row?.observed_at&&row.observed_at<=at&&+at-+row.observed_at<=Number(row.stale_after_seconds)*1000;
 const recognized=!!(current&&known&&o?.managed&&o.installed_version===o.version&&known.binary_sha256===o.binary_sha256&&known.runtime_sha256===o.runtime_sha256&&known.descriptor_sha256===o.descriptor_sha256);
 const worker=evidence.worker;
 const fresh=!!worker&&worker.generation===row?.current_generation&&worker.reported_at<=at&&+at-+worker.reported_at<=Number(row!.stale_after_seconds)*1000;
 return choices.map(choice=>{
  const action=choice.snapshot.descriptor;
  const report=evidence.reports.find(r=>r.grant_id===choice.grant_id&&r.generation===row?.current_generation&&r.reported_at<=at&&+at-+r.reported_at<=Number(row!.stale_after_seconds)*1000)?.report;
  const bound=!!report&&report.installation_id===choice.installation_id&&report.content_sha256===choice.content_sha256&&report.descriptor_sha256===choice.snapshot.descriptor_sha256&&report.revision===choice.permission_revision&&report.id===action.id;
  const permitted=worker?.origins.some(p=>p.github_id===choice.origin.github_id&&p.owner_id===choice.origin.owner_id&&p.classes.includes(action.execution_class));
  const reason=!['active','paused'].includes(host.lifecycle)?'maintenance_inactive':!choice.enabled?'maintenance_authority_revoked':!recognized?'maintenance_unrecognized'
   :!choice.snapshot.compatibility.architectures.includes(host.architecture)||host.os_id!=='debian'||host.os_version!=='13'?'maintenance_platform'
   :action.verification!==undefined&&(!validVersion(o?.version)||compare(o!.version,'0.0.24')<0)?'maintenance_agent_upgrade_required'
   :!fresh?'maintenance_agent_upgrade_required':!worker!.worker_ready?'maintenance_worker_unavailable':!permitted?'maintenance_local_policy_required'
   :!bound?'maintenance_readiness_unknown':!report!.ready?(report!.reason==='action_prerequisites'?'maintenance_prerequisites':'maintenance_local_policy_required')
   :busy?'maintenance_busy':action.requires_monitoring&&host.lifecycle!=='active'?'maintenance_resume_required':null;
  return {id:choice.grant_id,installation_id:choice.installation_id,action_id:action.id,name:choice.name,
   skill_id:choice.snapshot.skill_id,skill_name:choice.skill_name,description:choice.description,
   requires_approval:action.requires_approval,available:reason===null,reason,missing:bound?report!.missing:[]};
 });
}
/** Caller locks the host; report capabilities alone never establish signed identity. */
export async function maintenanceReadiness(trx:Transaction<Database>,host:Selectable<Hosts>,at:Date,options:{ownJob?:string;requireFresh?:boolean;choices?:Choices}={}){
 const {row,catalog,busy}=await readinessContext(trx,host,at,options.ownJob);
 const choices=options.choices??await grantedActions(trx),evidence=await actionReports(trx,row?.id);
 return {agent:row,actions:availableActions(host,row,catalog,busy,at,choices,evidence),choices};
}
async function readinessContext(trx:Transaction<Database>,host:Selectable<Hosts>,at:Date,ownJob?:string){
 const row=(await readinessReports(trx,[host.id]))[0],catalog=await readCatalog(trx),maintenance=await activeMaintenance(trx,host.id);
 const busy=!!maintenance&&maintenance.id!==ownJob||await activeAgentUpdate(trx,host.id,at)||!!row?.observation&&['installing','awaiting_confirmation','failed'].includes(row.observation.updater.outcome);
 return {row,catalog,busy};
}
/** Read-only diagnosis. Advice uses only admitted package prerequisite labels. */
export async function maintenanceReadinessDetails(trx:Transaction<Database>,host:Selectable<Hosts>,at:Date):Promise<ActionReadinessDetails>{
 const {row,catalog,busy}=await readinessContext(trx,host,at),choices=await grantedActions(trx),evidence=await actionReports(trx,row?.id);
 const reasons:Record<string,ActionReadinessState>={maintenance_unrecognized:'unrecognized',maintenance_platform:'platform_unsupported',maintenance_inactive:'inactive',maintenance_busy:'busy',maintenance_resume_required:'monitoring_paused',maintenance_agent_upgrade_required:'unsupported_agent',maintenance_prerequisites:'missing_prerequisites',maintenance_local_policy_required:'local_policy_required',maintenance_worker_unavailable:'worker_unavailable'};
 const actions=availableActions(host,row,catalog,busy,at,choices,evidence).map(action=>{
  const choice=choices.find(c=>c.grant_id===action.id)!;
  const state:ActionReadinessState=action.reason?reasons[action.reason]??'unknown':'ready';
  const packages=[...new Set(action.missing.map(id=>choice.snapshot.descriptor.prerequisites.find(p=>p.id===id)?.package).filter((p):p is string=>!!p))];
  return {id:action.id,name:action.name,state,missing_packages:state==='missing_prerequisites'?packages:[]};
 });
 const observed=evidence.worker?.reported_at??null;
 return {observed_at:observed?.toISOString()??null,valid_until:observed?new Date(+observed+Number(row?.stale_after_seconds??0)*1000).toISOString():null,actions};
}
/** Bounded advisory page projection; commands independently recheck under locks. */
export async function maintenanceMenuStates(trx:Transaction<Database>,hosts:Selectable<Hosts>[],at:Date){
 const result=new Map<string,MaintenanceMenuState>();if(!hosts.length)return result;
 const ids=hosts.map(h=>h.id),rows=await readinessReports(trx,ids),catalog=await readCatalog(trx),choices=await grantedActions(trx);
 const agents=rows.map(r=>r.id),workers=agents.length?await trx.selectFrom('agent_action_workers').selectAll().where('agent_id','in',agents).execute():[],reports=agents.length?await trx.selectFrom('agent_action_readiness').selectAll().where('agent_id','in',agents).execute():[];
 const jobs=await trx.selectFrom('maintenance_jobs').select(['id','operation_id','host_id','phase','attention','apply_attempt','recovery_pending'])
  .where('host_id','in',ids).where(eb=>eb.or([eb('attention','=',true),eb('recovery_pending','=',true),eb('phase','not in',terminalPhases)])).execute();
 const updates=await trx.selectFrom('agent_update_requests').select('host_id').where('host_id','in',ids).where('state','in',activeUpdateStates).where('expires_at','>',at).execute();
 for(const host of hosts){
  const row=rows.find(r=>r.host_id===host.id),job=jobs.find(j=>j.host_id===host.id),o=row?.observation;
  const busy=!!job||updates.some(u=>u.host_id===host.id)||!!o&&['installing','awaiting_confirmation','failed'].includes(o.updater.outcome);
  result.set(host.id,{job:job?{id:job.id,operation_id:job.operation_id,phase:job.phase,attention:job.attention,apply_attempt:job.apply_attempt,recovery_pending:job.recovery_pending}:null,
   actions:availableActions(host,row,catalog,busy,at,choices,{worker:workers.find(w=>w.agent_id===row?.id),reports:reports.filter(r=>r.agent_id===row?.id)})});
 }
 return result;
}
