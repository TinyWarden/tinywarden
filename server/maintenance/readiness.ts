import type {Selectable,Transaction} from 'kysely';
import type {Database,Hosts} from '../db/types';
import type {MaintenanceReadiness,MaintenanceMenuState} from '../../lib/maintenance/contracts';
import {maintenanceActions,maintenanceUnavailable,registeredAction,terminalPhases} from '../../lib/maintenance/policy';
import {exactObject} from '../validation';
import {fail} from '../errors';
import {readCatalog,freshCatalog} from '../agent-updates/catalog';
import {activeAgentUpdate,activeUpdateStates} from '../agent-updates/requests';
import {activeMaintenance} from './fencing';
import type {ActionReadinessDetails,ActionReadinessState} from '../../lib/maintenance/readiness';

export function validateMaintenanceReadiness(raw:unknown):MaintenanceReadiness{
 const v=exactObject(raw,['capability','worker_ready','actions']);
 if(v.capability!=='maintenance_jobs.v1'||typeof v.worker_ready!=='boolean'||!Array.isArray(v.actions)||v.actions.length>8)fail('invalid_request',400);
 const actions=v.actions.map(raw=>{
  const item=exactObject(raw,['id','ready','missing']);const action=registeredAction(maintenanceActions,item.id);
  const allowed:readonly string[]=action?.prerequisites??[];
  if(!action||typeof item.ready!=='boolean'||!Array.isArray(item.missing)||item.missing.length>8||item.missing.some(name=>typeof name!=='string'||!allowed.includes(name)))fail('invalid_request',400);
  if(item.ready!==(item.missing.length===0))fail('invalid_request',400);
  return {id:action.id,ready:item.ready,missing:item.missing as string[]};
 });
 if(new Set(actions.map(a=>a.id)).size!==actions.length)fail('invalid_request',400);
 return {capability:v.capability,worker_ready:v.worker_ready,actions};
}
function readinessReports(trx:Transaction<Database>,ids:string[]){return trx.selectFrom('agents as a').leftJoin('agent_platform_reports as r',j=>j.onRef('r.agent_id','=','a.id').onRef('r.generation','=','a.current_generation'))
 .select(['a.id','a.host_id','a.current_generation','a.stale_after_seconds','r.observation','r.observed_at']).where('a.host_id','in',ids).where('a.revoked_at','is',null).execute();}
type Report=Awaited<ReturnType<typeof readinessReports>>[number];
function availableActions(host:Selectable<Hosts>,row:Report|undefined,catalog:Awaited<ReturnType<typeof readCatalog>>,busy:boolean,at:Date,requireFresh=false){
 const o=row?.observation;
 const known=freshCatalog(catalog,at)&&catalog.releases.find(r=>r.metadata.version===o?.version)?.metadata;
 const current=!!row?.observed_at&&at.getTime()-row.observed_at.getTime()<=Number(row.stale_after_seconds)*1000;
 const recognized=!!((!requireFresh||current)&&known&&o?.managed&&o.installed_version===o.version&&row?.observed_at&&row.observed_at<=at&&known.binary_sha256===o.binary_sha256&&known.runtime_sha256===o.runtime_sha256&&known.descriptor_sha256===o.descriptor_sha256);
 return maintenanceActions.map(action=>{
  const report=o?.maintenance?.actions.find(a=>a.id===action.id);
  const reason=maintenanceUnavailable(action,{lifecycle:host.lifecycle,recognized,os:host.os_id,os_version:host.os_version,architecture:host.architecture,
   mutation_busy:busy,capabilities:o?.maintenance?.worker_ready&&report?[action.id]:[],
   prerequisites:Object.fromEntries(action.prerequisites.map(p=>[p,!!report&&!report.missing.includes(p)]))});
  return {id:action.id,available:reason===null,reason};
 });
}
/** Caller locks the host; report capabilities alone never establish signed identity. */
export async function maintenanceReadiness(trx:Transaction<Database>,host:Selectable<Hosts>,at:Date,options:{ownJob?:string;requireFresh?:boolean}={}){
 const {row,catalog,busy}=await readinessContext(trx,host,at,options.ownJob);
 return {agent:row,actions:availableActions(host,row,catalog,busy,at,options.requireFresh)};
}
async function readinessContext(trx:Transaction<Database>,host:Selectable<Hosts>,at:Date,ownJob?:string){
 const row=(await readinessReports(trx,[host.id]))[0],catalog=await readCatalog(trx),maintenance=await activeMaintenance(trx,host.id);
 const busy=!!maintenance&&maintenance.id!==ownJob||await activeAgentUpdate(trx,host.id,at)||!!row?.observation&&['installing','awaiting_confirmation','failed'].includes(row.observation.updater.outcome);
 return {row,catalog,busy};
}
/** Read-only diagnosis. Missing-package advice requires fresh recognized evidence. */
export async function maintenanceReadinessDetails(trx:Transaction<Database>,host:Selectable<Hosts>,at:Date):Promise<ActionReadinessDetails>{
 const {row,catalog,busy}=await readinessContext(trx,host,at),o=row?.observation;
 const current=!!row?.observed_at&&row.observed_at<=at&&+at-+row.observed_at<=Number(row.stale_after_seconds)*1000;
 const reasons:Record<string,ActionReadinessState>={maintenance_unrecognized:'unrecognized',maintenance_platform:'platform_unsupported',
  maintenance_inactive:'inactive',maintenance_busy:'busy',maintenance_resume_required:'monitoring_paused',
  maintenance_agent_upgrade_required:'unsupported_agent',maintenance_prerequisites:'missing_prerequisites'};
 const actions=availableActions(host,row,catalog,busy,at).map(action=>{
  let state:ActionReadinessState=!o||!row?.observed_at||row.observed_at>at?'unknown':!current?'stale':!freshCatalog(catalog,at)?'catalog_unavailable'
   :action.reason==='maintenance_unrecognized'?'unrecognized':!o.maintenance?'unsupported_agent':!o.maintenance.worker_ready?'worker_unavailable'
   :action.reason?reasons[action.reason]??'unknown':'ready';
  const definition=registeredAction(maintenanceActions,action.id)!;
  const missing=o?.maintenance?.actions.find(a=>a.id===action.id)?.missing??[];
  const packageNames:Readonly<Record<string,string>>=definition.prerequisite_packages??{};
  const packages=[...new Set(missing.map(name=>packageNames[name]).filter((p):p is string=>typeof p==='string'))];
  if(state==='missing_prerequisites'&&!packages.length)state='unknown';
  return {id:action.id,state,missing_packages:state==='missing_prerequisites'?packages:[]};
 });
 return {observed_at:row?.observed_at?.toISOString()??null,
  valid_until:current&&freshCatalog(catalog,at)?new Date(Math.min(+row!.observed_at!+Number(row!.stale_after_seconds)*1000,+catalog.verified_at!+86400000)).toISOString():null,actions};
}
/** Bounded advisory page projection; commands independently recheck under locks. */
export async function maintenanceMenuStates(trx:Transaction<Database>,hosts:Selectable<Hosts>[],at:Date){
 const result=new Map<string,MaintenanceMenuState>();if(!hosts.length)return result;
 const ids=hosts.map(h=>h.id),rows=await readinessReports(trx,ids),catalog=await readCatalog(trx);
 const jobs=await trx.selectFrom('maintenance_jobs').select(['id','operation_id','host_id','phase','attention','apply_attempt','recovery_pending'])
  .where('host_id','in',ids).where(eb=>eb.or([eb('attention','=',true),eb('recovery_pending','=',true),eb('phase','not in',terminalPhases)])).execute();
 const updates=await trx.selectFrom('agent_update_requests').select('host_id').where('host_id','in',ids).where('state','in',activeUpdateStates).where('expires_at','>',at).execute();
 for(const host of hosts){
  const row=rows.find(r=>r.host_id===host.id),job=jobs.find(j=>j.host_id===host.id),o=row?.observation;
  const busy=!!job||updates.some(u=>u.host_id===host.id)||!!o&&['installing','awaiting_confirmation','failed'].includes(o.updater.outcome);
  result.set(host.id,{job:job?{id:job.id,operation_id:job.operation_id,phase:job.phase,attention:job.attention,apply_attempt:job.apply_attempt,recovery_pending:job.recovery_pending}:null,
   actions:availableActions(host,row,catalog,busy,at)});
 }
 return result;
}
