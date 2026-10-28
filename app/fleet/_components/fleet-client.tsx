"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {useRouter,useSearchParams} from "next/navigation";
import {messages} from "@/i18n/messages";
import {OperatorShell,ReadNotice} from "@/components/operator/shell";
import {useFleetGroups} from "@/components/operator/use-fleet-groups";
import {useOperatorSession} from "@/components/operator/session-provider";
import {useOperatorRead} from "@/components/operator/use-operator-read";
import {compactDashboardTime,time,text} from "@/components/operator/format";
import {PageHeader} from "@/components/playbook/page";
import {DataTable} from "@/components/playbook/data";
import {PlaybookButton,RowStatus,EmptyState} from "@/components/playbook/controls";
import {PlaybookIcon} from "@/components/playbook/skill";
import {ActionMenu} from "@/components/playbook/action-menu";
import {CursorPagination} from "@/components/playbook/pagination";
import {validFleet,type ServerRow} from "./model";
import {ManageDialog} from "./manage-dialog";
import {fleetMenuActions,type ManageMode} from "./actions";
import {GroupDialog} from "./group-dialog";
import {SetupDialog} from "./setup-dialog";
import {PendingDialog,ProgressDialog,type ProgressHint} from "./progress-dialog";
import {PrepareDialog} from './prepare-dialog';
import {skillActionGroups} from '@/lib/skills/action-choices';
import {SkillActionPicker} from '@/components/skills/action-picker';
import type {MaintenanceAction} from '@/lib/maintenance/contracts';
import {useOperatorCommand} from '@/components/operator/use-operator-command';
import {consumeAuthority} from '@/components/operator/authority';
import {validActionGrants} from '@/components/skills/action-model';
import {canStartImmediately,actionStartBody,actionProgressContext} from './skill-action-start';
import type {SkillActionChoice} from '@/lib/skills/action-choices';
import {Field,FleetDialog} from "./fields";
const t=messages.fleetManagement,filterKeys=['q','group','tag','lifecycle','health','contact','maintenance','os','version','sort'];
export function FleetClient(){const [filters,setFilters]=useState(false);const search=useSearchParams(),scope=new URLSearchParams();for(const key of filterKeys)for(const value of search.getAll(key))scope.append(key,value);return <FleetInventory key={scope.toString()} filters={filters} setFilters={setFilters}/>;}
function FleetInventory({filters,setFilters}:{filters:boolean;setFilters:(open:boolean)=>void}){
 const search=useSearchParams(),router=useRouter(),admin=useOperatorSession()?.role==='admin',params=new URLSearchParams();for(const key of [...filterKeys,'cursor'])for(const value of search.getAll(key))params.append(key,value);
  const path='/api/v1/operator/fleet?'+params.toString(),read=useOperatorRead(path,validFleet,30000),v=read.value,disabled=read.busy||read.failed||read.expired||read.outdated;
 const [query,setQuery]=useState(search.get('q')??''),[groupQuery,setGroupQuery]=useState(''),[selected,setSelected]=useState<Map<string,ServerRow>>(new Map()),[dialog,setDialog]=useState<{mode:ManageMode;rows:ServerRow[]}|null>(null),[groupsOpen,setGroupsOpen]=useState(false),[setup,setSetup]=useState<{mode:'new'|'restore'|'replace';target?:ServerRow}|null>(null),[pending,setPending]=useState(false);
 const groupRead=useFleetGroups(groupQuery,search.get('group')&&search.get('group')!=='ungrouped'?[search.get('group')!]:[]);
 const [preparation,setPreparation]=useState<{action:MaintenanceAction;rows:ServerRow[]}|null>(null);
 const [picker,setPicker]=useState<{rows:ServerRow[];single:boolean}|null>(null),actionFocus=useRef<HTMLButtonElement|null>(null);
 const pickerRows=picker?.rows.map(row=>v?.hosts.find(h=>h.host_id===row.host_id)??row)??[];
 const cursors=useRef<(string|null)[]>([null]),page=Math.max(1,Number(search.get('page'))||1),rows=[...selected.values()].map(row=>v?.hosts.find(h=>h.host_id===row.host_id)??row),operation=search.get('operation'),group=search.get('group'),lifecycle=search.get('lifecycle')??'active';
 const visibleOperation=useRef(operation);
 useEffect(()=>{visibleOperation.current=operation;},[operation]);
 const direct=useOperatorCommand(15000,undefined,{...t.errors,...messages.maintenanceActions.errors});
 const [starting,setStarting]=useState<{id:string;hostId:string;hint:ProgressHint;loading:boolean;error:boolean}|null>(null),launching=useRef(false);
 const [progress,setProgress]=useState<{id:string;hint?:ProgressHint|undefined}|null>(null);
 async function chooseAction(action:SkillActionChoice){
  if(!picker||disabled||launching.current||direct.uncertain)return;
  const chosen=pickerRows,immediate=picker.single;
  if(!immediate){setPicker(null);setPreparation({action:action.id,rows:chosen});return;}
  const id=crypto.randomUUID(),hint:ProgressHint={kind:'maintenance_action',progress:{name:action.name,single:true,server:chosen[0]!.label,presentation:{name:action.name,description:action.description,requires_approval:action.requires_approval,reason:null,facts:[]}}};
  launching.current=true;direct.clearNotice();setPicker(null);setStarting({id,hostId:chosen[0]!.host_id,hint,loading:true,error:false});showOperation(id,hint);
  try{
   const response=await fetch(`/api/v2/operator/skills/${encodeURIComponent(action.installation_id)}/actions`,{credentials:'same-origin',signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error('unavailable');
   const source:unknown=await response.json();if(!validActionGrants(source)||source.installation_id!==action.installation_id)throw new Error('unavailable');consumeAuthority(source);
   const choice=source.actions.find(a=>a.grant_id===action.id&&a.enabled);
   if(!choice||choice.snapshot.descriptor.id!==action.action_id)throw new Error('unavailable');
   if(!canStartImmediately(choice.snapshot)){setStarting(null);if(visibleOperation.current===id){closeOperation();setPreparation({action:action.id,rows:chosen});}return;}
   const currentHint={kind:'maintenance_action',progress:actionProgressContext(choice.snapshot,chosen)};
   setProgress(current=>current?.id===id?{id,hint:currentHint}:current);
   setStarting(current=>current?.id===id?{...current,hint:currentHint}:current);
   const body=actionStartBody(id,action.id,source,choice,chosen,{});
   if(chosen.length!==1||body.targets.length!==1||body.targets[0]!.id!==chosen[0]!.host_id)throw new Error('scope');
   const accepted=await direct.send('/api/v1/operator/fleet/maintenance',body,refresh,value=>{
    if(!value||typeof value!=='object'||!('id' in value)||value.id!==id)throw new Error('maintenance_receipt_invalid');
    setStarting(null);
   });
   if(!accepted)setStarting(current=>current?.id===id?{...current,error:true}:current);
  }catch{setStarting(current=>current?{...current,error:true}:current);}
  finally{launching.current=false;setStarting(current=>current?{...current,loading:false}:current);}
 }
 const activityButton=useRef<HTMLButtonElement>(null),returnFocus=useRef(false);
 useEffect(()=>{if(!operation&&returnFocus.current){returnFocus.current=false;if(actionFocus.current?.isConnected){actionFocus.current.focus();actionFocus.current=null;}else activityButton.current?.focus();}},[operation]);
 const refresh=async()=>{await Promise.all([read.reload(),groupRead.reload()]);};
 function navigate(change:Record<string,string|null>,paging=false){const next=new URLSearchParams(search.toString());for(const [key,value]of Object.entries(change)){next.delete(key);if(value)next.set(key,value);}if(!paging){next.delete('cursor');next.delete('page');next.delete('operation');next.delete('operation_kind');cursors.current=[null];}router.push(`/fleet?${next}`,{scroll:false});}
 function showOperation(id:string,hint?:ProgressHint){
  visibleOperation.current=id;
  const resolved=hint??(progress?.id===id?progress.hint:undefined);
  setProgress({id,hint:resolved});const next=new URLSearchParams(search.toString());next.set('operation',id);
  if(resolved?.kind)next.set('operation_kind',resolved.kind);else next.delete('operation_kind');
  window.history.replaceState(null,'','/fleet?'+next);
 }
 function closeOperation(){visibleOperation.current=null;returnFocus.current=true;const next=new URLSearchParams(search.toString());next.delete('operation');next.delete('operation_kind');window.history.replaceState(null,'','/fleet?'+next);void read.reload();}
 function showRowOperation(row:ServerRow){const job=row.maintenance_jobs?.job;if(job)showOperation(job.operation_id,{kind:'maintenance_action',progress:job.progress});}
 function toggle(row:ServerRow,checked:boolean){setSelected(old=>{const next=new Map(old);if(checked&&next.size<100)next.set(row.host_id,row);else if(!checked)next.delete(row.host_id);return next;});}
 function manage(mode:ManageMode,targets=rows){if(targets.length)setDialog({mode,rows:targets});}
 function restoreActionFocus(){const trigger=actionFocus.current;actionFocus.current=null;requestAnimationFrame(()=>{if(trigger?.isConnected)trigger.focus();else document.getElementById('main')?.focus();});}
 const actionItems=(targets:ServerRow[],single=false)=>fleetMenuActions(targets).map(item=>({...item,id:item.action,danger:item.action==='remove',action:(trigger:HTMLButtonElement)=>{
  if(item.action==='view-progress'){actionFocus.current=trigger;showRowOperation(targets[0]!);}
  else if(item.action==='restore'||item.action==='reconnect')setSetup({mode:item.action==='restore'?'restore':'replace',target:targets[0]!});
  else if(item.action==='skill-actions'){actionFocus.current=trigger;setPicker({rows:targets,single});}
  else manage((item.action==='endMaintenance'?'end':item.action) as ManageMode,targets);
 }}));
 const select=(key:string,label:string,options:{value:string;label:string}[])=><Field label={label}><select className="tw-input" value={search.get(key)??''} onChange={e=>navigate({[key]:e.target.value})}><option value="">{t.any}</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>;
 return <OperatorShell active="fleet" asOf={v?.as_of}><main id="main" tabIndex={-1} className="tw-ui tw-main tw-fleet-main">
  <PageHeader title={t.title} description={t.help} actions={admin?<div className="tw-btns"><PlaybookButton ref={activityButton} variant="secondary" type="button" onClick={()=>setPending(true)}>{t.activity}</PlaybookButton><PlaybookButton type="button" onClick={()=>setSetup({mode:'new'})}><PlaybookIcon name="plus"/>{t.addServer}</PlaybookButton></div>:undefined}/>
  <ReadNotice expired={read.expired} failed={read.failed} loaded={!!v}/>
  <div className="tw-split tw-split--master"><aside className="tw-card tw-split__rail tw-fleet-sidebar"><div className="tw-fleet-sidebar__search"><input className="tw-input" type="search" aria-label={t.searchGroups} placeholder={t.searchGroups} value={groupQuery} onChange={e=>setGroupQuery(e.target.value)}/></div><nav className="tw-list" aria-label={t.groups}>
   {[{id:'',name:t.allServers,count:v?.group_totals.all??0},{id:'ungrouped',name:t.ungrouped,count:v?.group_totals.ungrouped??0},...(groupRead.value?.groups??v?.groups??[])].map(g=><button key={g.id} type="button" className="tw-item" aria-current={(group??'')===g.id?'true':undefined} onClick={()=>navigate({group:g.id})}><span className="tw-item__main"><span className="tw-item__name">{g.name}</span></span><span className="tw-meta">{g.count}</span></button>)}
  </nav>{groupRead.previous||groupRead.next?<div className="tw-card__body tw-btns"><PlaybookButton type="button" variant="secondary" className="tw-btn--sm" disabled={groupRead.busy||!groupRead.previous} onClick={groupRead.back}>{t.previous}</PlaybookButton><PlaybookButton type="button" variant="secondary" className="tw-btn--sm" disabled={groupRead.busy||!groupRead.next} onClick={groupRead.forward}>{t.next}</PlaybookButton></div>:null}{admin?<footer className="tw-card__foot"><PlaybookButton variant="secondary" type="button" disabled={!v||disabled} onClick={()=>setGroupsOpen(true)}><PlaybookIcon name="settings"/>{t.manageGroups}</PlaybookButton></footer>:null}</aside>
  <div className="tw-fleet-content"><section className="tw-card tw-fleet-card" aria-label={t.title}>
   <header className="tw-card__head"><div className="tw-card__titles"><h2 className="tw-t-section">{group==='ungrouped'?t.ungrouped:(groupRead.value?.selected??v?.groups??[]).find(g=>g.id===group)?.name??t.allServers}</h2><span className="tw-meta">{v?.total??0}</span></div></header>
   <div className="tw-card__body tw-form-body"><form className="tw-fleet-toolbar" onSubmit={e=>{e.preventDefault();navigate({q:query});}}><Field label={t.searchServers}><input className="tw-input" type="search" value={query} maxLength={100} onChange={e=>setQuery(e.target.value)}/></Field><PlaybookButton variant="secondary" type="submit" className="tw-btn--sm" aria-label={t.searchServers}><PlaybookIcon name="search"/></PlaybookButton><PlaybookButton type="button" variant="secondary" className="tw-btn--sm" aria-expanded={filters} onClick={()=>setFilters(!filters)}><PlaybookIcon name="settings"/>{t.filters}</PlaybookButton></form>
    <div className="tw-seg tw-seg--scroll" role="group" aria-label={t.status}>{(['all','active','paused',...(admin?['archived' as const]:[])] as const).map(state=><button key={state} type="button" className="tw-seg__opt" aria-pressed={lifecycle===state} onClick={()=>navigate({lifecycle:state})}>{t[state as "active"]} <span className="tw-seg__count">{v?.counts[state as keyof typeof v.counts]??0}</span></button>)}</div>
    {filters?<><div className="tw-fleet-filters">{select('health',t.health,['critical','warning','unknown','healthy'].map(value=>({value,label:messages.dashboard.states[value as 'healthy']})))}{select('contact',t.contact,['current','stale','unknown','revoked'].map(value=>({value,label:t[value as 'current']})))}{select('maintenance',t.maintenance,[{value:'active',label:t.maintenance},{value:'scheduled',label:t.scheduled},{value:'none',label:t.none}])}{select('tag',t.tag,(v?.tag_choices??[]).map(value=>({value,label:value})))}<Field label={t.operatingSystem}><input className="tw-input" defaultValue={search.get('os')??''} onBlur={e=>{if(e.target.value!==(search.get('os')??''))navigate({os:e.target.value});}}/></Field><Field label={t.version}><input className="tw-input" defaultValue={search.get('version')??''} onBlur={e=>{if(e.target.value!==(search.get('version')??''))navigate({version:e.target.value});}}/></Field>{select('sort',t.sort,[{value:'name',label:t.name},{value:'status',label:t.health},{value:'contact',label:t.newestContact}])}</div><button className="tw-link" type="button" onClick={()=>router.push('/fleet')}>{t.clearFilters}</button></>:null}
   </div>
   {admin&&rows.length?<div className="tw-fleet-bulk"><strong>{text(t.selected,{count:rows.length})}</strong><button type="button" className="tw-link" onClick={()=>setSelected(new Map())}>{t.clear}</button><div className="tw-btns">{actionItems(rows).filter(item=>item.id==='membership'||item.id==='maintenance').map(item=><PlaybookButton key={item.id} variant="secondary" type="button" className="tw-btn--sm" disabled={disabled} onClick={e=>item.action(e.currentTarget)}>{item.label}</PlaybookButton>)}<ActionMenu label={t.more} items={actionItems(rows).filter(item=>item.id!=='membership'&&item.id!=='maintenance')} disabled={disabled}/></div></div>:null}
   {!v?<div className="tw-card__body"><p role="status">{read.failed?messages.fleet.unavailable:messages.dashboard.loading}</p></div>:v.hosts.length?<DataTable className="tw-table--edge-align tw-table--wrap-headings tw-table--comfortable tw-table--stack tw-table--selection tw-table--labelled tw-fleet-table" rowIds={v.hosts.map(h=>h.host_id)} columns={[
    ...(admin?[{key:'select',label:t.selectPage,utility:true,heading:<input type="checkbox" aria-label={t.selectPage} disabled={disabled||selected.size>=100&&!v.hosts.every(h=>selected.has(h.host_id))} checked={v.hosts.every(h=>selected.has(h.host_id))} ref={el=>{if(el)el.indeterminate=v.hosts.some(h=>selected.has(h.host_id))&&!v.hosts.every(h=>selected.has(h.host_id));}} onChange={e=>{const checked=e.target.checked;setSelected(old=>{const next=new Map(old);for(const h of v.hosts)if(checked&&next.size<100)next.set(h.host_id,h);else if(!checked)next.delete(h.host_id);return next;});}}/>}]:[]),
    {key:'server',label:t.server},{key:'status',label:t.status},{key:'os',label:t.operatingSystem},{key:'contact',label:t.lastContact},...(admin?[{key:'actions',label:t.actions}]:[])
   ]} rows={v.hosts.map(h=>({select:<input type="checkbox" aria-label={text(t.selectServer,{name:h.label})} checked={selected.has(h.host_id)} disabled={disabled||!selected.has(h.host_id)&&selected.size>=100} onChange={e=>toggle(h,e.target.checked)}/>,server:<div className="tw-fleet-name"><Link className="tw-link tw-mono" href={'/fleet/'+h.host_id}>{h.label}</Link><RowStatus status={h.contact_state==='current'?'healthy':h.contact_state==='stale'?'stale':'off'} value={t[h.contact_state as "current"]}/></div>,status:<div>{h.lifecycle!=='active'?<RowStatus status={h.lifecycle==='paused'&&!h.control_applied?'running':'off'} value={h.lifecycle==='paused'&&!h.control_applied?t.pausePending:t[h.lifecycle]}/>:!h.control_applied&&h.control_supported?<RowStatus status="running" value={t.resumePending}/>:<RowStatus status={h.health_state as 'healthy'}/ >}{h.maintenance?<p><RowStatus status="informational" value={h.maintenance.phase==='active'?t.maintenance:t.scheduled}/></p>:null}{h.maintenance_jobs?.job?<div className="tw-form-body"><RowStatus status={h.maintenance_jobs.job.attention||h.maintenance_jobs.job.recovery_pending?'warning':'running'} value={h.maintenance_jobs.job.attention||h.maintenance_jobs.job.recovery_pending?messages.skillActions.attention:messages.skillActions.running}/><p className="tw-t-secondary">{messages.skillActions.busyHelp}</p>{admin?<button className="tw-link" type="button" onClick={event=>{actionFocus.current=event.currentTarget;showRowOperation(h);}}>{messages.skillActions.viewProgress}</button>:null}</div>:null}{starting?.hostId===h.host_id&&!h.maintenance_jobs?.job?<div className="tw-form-body"><RowStatus status={starting.error?"warning":"running"} value={starting.error?messages.skillActions.attention:messages.skillActions.starting}/><button className="tw-link" type="button" onClick={event=>{actionFocus.current=event.currentTarget;showOperation(starting.id,starting.hint);}}>{messages.skillActions.viewProgress}</button></div>:null}</div>,os:<span className="tw-mono">{h.os_id+' '+h.os_version}</span>,contact:<time title={time(h.last_contact_at,true)} dateTime={h.last_contact_at??undefined}>{h.last_contact_at?compactDashboardTime(Date.parse(h.last_contact_at),v.as_of).label:messages.fleet.never}</time>,actions:<ActionMenu compact label={t.manage} items={actionItems([h],true)} disabled={disabled}/>}))}/>:<EmptyState title={t.emptyTitle}>{t.emptyHelp}</EmptyState>}
   {v?<CursorPagination page={page} count={v.hosts.length} total={v.total} loading={read.busy} hasNext={!!v.next_cursor} itemLabel={t.serverCount} onNext={()=>{if(v.next_cursor){cursors.current[page]=v.next_cursor;navigate({cursor:v.next_cursor,page:String(page+1)},true);}}} onPrevious={()=>navigate({cursor:cursors.current[page-2]??null,page:page>2?String(page-1):null},true)}/>:null}
  </section></div></div>
  {groupsOpen&&v?<GroupDialog close={()=>setGroupsOpen(false)} reload={refresh}/>:null}
  {picker?<FleetDialog title={messages.skillActions.title} help={picker.single?text(messages.skillActions.pickerTarget,{name:picker.rows[0]!.label}):text(messages.skillActions.pickerTargets,{count:picker.rows.length})} close={()=>{setPicker(null);restoreActionFocus();}} step="skill-actions">
   <SkillActionPicker groups={skillActionGroups(pickerRows)} status={!admin||read.failed||read.expired||read.outdated?'unavailable':read.busy?'loading':'ready'} choose={action=>void chooseAction(action)}/>
  </FleetDialog>:null}
  {preparation?<PrepareDialog action={preparation.action} rows={preparation.rows} close={()=>{setPreparation(null);if(operation)closeOperation();restoreActionFocus();}} reload={refresh} remember={showOperation} created={id=>{setPreparation(null);showOperation(id);}}/>:null}
  {dialog&&v?<ManageDialog key={dialog.mode+dialog.rows.map(r=>r.host_id).join()} mode={dialog.mode} rows={dialog.rows} groups={v.groups} close={()=>{setDialog(null);setSelected(new Map());}} reload={refresh} operation={showOperation}/>:null}
  {setup?<SetupDialog mode={setup.mode} {...(setup.target?{target:setup.target}:{})} groups={v?.groups??[]} close={()=>setSetup(null)} reload={refresh}/>:null}
  {pending?<PendingDialog close={()=>setPending(false)} showOperation={(id,hint)=>{setPending(false);showOperation(id,hint);}}/>:null}
  {operation||progress?<ProgressDialog key={operation??progress!.id} id={operation??progress!.id} close={closeOperation} open={!!operation&&!dialog&&!setup&&!pending&&!preparation&&!picker} hint={progress&&progress.id===(operation??progress.id)?progress.hint:operation?{kind:search.get('operation_kind')??'',progress:v?.hosts.find(h=>h.maintenance_jobs?.job?.operation_id===operation)?.maintenance_jobs?.job?.progress}:undefined} launch={starting&&starting.id===(operation??progress?.id)?{...starting,loading:starting.loading||direct.busy,uncertain:direct.uncertain,notice:direct.notice,retry:()=>void direct.retry(refresh)}:undefined}/>:null}
 </main></OperatorShell>;
}
