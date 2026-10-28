"use client";
import {useState} from "react";
import {messages} from "@/i18n/messages";
import {PlaybookButton,RowStatus,EmptyState} from "@/components/playbook/controls";
import {DataTable} from "@/components/playbook/data";
import {useOperatorCommand} from "@/components/operator/use-operator-command";
import {useOperatorRead} from "@/components/operator/use-operator-read";
import {time,text} from "@/components/operator/format";
import {FleetDialog,CommandNotice} from "./fields";
import {MaintenanceDialog} from './maintenance-dialog';
const t=messages.fleetManagement;
type OperationRead={as_of?:string;schema_version:1;id:string;kind:string;
 items:{host_id:string;label?:string|null;state:string;outcome:string|null}[];
 updates:{host_id:string;target_version:string;state:string;error:string|null;expires_at:string}[];
 purge:{host_id:string;state:string;stage:number;deleted_rows:string;error:string|null}[]};
function validOperation(v:unknown):v is OperationRead{const r=v as OperationRead;return !!r&&r.schema_version===1&&typeof r.id==='string'&&Array.isArray(r.items)&&Array.isArray(r.purge)&&Array.isArray(r.updates);}
function resultLabel(value:string){return (t as Record<string,unknown>)[value] as string??t.errors[value as keyof typeof t.errors]??t.otherFailure;}
const operationInterval=(v:OperationRead|null)=>v?.kind==='maintenance_action'?Infinity:2000;
export function ProgressDialog({id,close}:{id:string;close:()=>void}){
 const read=useOperatorRead('/api/v1/operator/fleet-operations/'+encodeURIComponent(id),validOperation,operationInterval),command=useOperatorCommand(15000,undefined,t.errors),v=read.value;
 const retry=v?.items.some(i=>i.state==='pending'&&!v.updates.some(u=>u.host_id===i.host_id));
 if(v?.kind==='maintenance_action')return <MaintenanceDialog id={id} close={close}/>;
 return <FleetDialog title={v?.kind==='update'?t.updateNow:t.operation} help={v?.kind==='update'?t.updateProgressHelp:t.operationHelp} close={close} locked={command.busy||command.uncertain} actions={<>{retry?<PlaybookButton type="button" disabled={command.busy||command.uncertain} onClick={()=>void command.send(`/api/v1/operator/fleet-operations/${id}/resume`,{request_id:undefined},read.reload)}>{t.retry}</PlaybookButton>:null}<PlaybookButton variant="secondary" type="button" disabled={read.busy} onClick={()=>void read.reload()}>{t.operationRefresh}</PlaybookButton></>}>
  {!v?<p role="status">{read.failed?messages.fleet.unavailable:messages.dashboard.loading}</p>:<DataTable className="tw-table--edge-align tw-table--wrap-headings tw-table--stack tw-table--labelled" columns={[{key:'host',label:t.server},...(v.kind==='update'?[{key:'target',label:t.updateTarget}]:[]),{key:'state',label:t.result},...(v.kind==='update'?[]:[{key:'action',label:t.actions}])]} rows={v.items.map(item=>{
   const job=v.purge.find(p=>p.host_id===item.host_id),update=v.updates.find(u=>u.host_id===item.host_id),state=update?.state??job?.state??item.state;
   return {host:item.label?<strong>{item.label}</strong>:<code>{item.host_id}</code>,target:update?.target_version??'—',state:<div><RowStatus status={state==='failed'?'warning':state==='pending'||state==='running'||['queued','installing','confirming'].includes(state)?'running':state==='succeeded'?'healthy':'off'} value={job?.state==='completed'?t.deleted:resultLabel(state)}/>{job?<p className="tw-meta">{text(t.rowsDeleted,{count:job.deleted_rows})}</p>:update?.error?<p>{resultLabel(update.error)}</p>:!update&&item.outcome?<p>{resultLabel(item.outcome)}</p>:null}</div>,action:job?.state==='failed'?<PlaybookButton variant="secondary" type="button" className="tw-btn--sm" disabled={command.busy||command.uncertain} onClick={()=>void command.send(`/api/v1/operator/hosts/${item.host_id}/purge/retry`,{request_id:undefined},read.reload)}>{t.retryDeletion}</PlaybookButton>:null};
  })}/>}
  <CommandNotice command={command}/>
 </FleetDialog>;
}
type ActivityPage={as_of?:string;schema_version:1;total:number;next_cursor:string|null};
type Setups=ActivityPage&{setups:{id:string;label:string;state:string;mode:string;expires_at:string;issued_at:string}[]};
function validSetups(v:unknown):v is Setups{const r=v as Setups;return !!r&&r.schema_version===1&&Number.isSafeInteger(r.total)&&r.total>=0&&(r.next_cursor===null||typeof r.next_cursor==='string')&&Array.isArray(r.setups);}
type Operations=ActivityPage&{operations:{id:string;kind:string;created_at:string}[]};
function validOperations(v:unknown):v is Operations{const r=v as Operations;return !!r&&r.schema_version===1&&Number.isSafeInteger(r.total)&&r.total>=0&&(r.next_cursor===null||typeof r.next_cursor==='string')&&Array.isArray(r.operations);}
export function PendingDialog({close,showOperation}:{close:()=>void;showOperation:(id:string)=>void}){
 const [tab,setTab]=useState('operations'),[unfinished,setUnfinished]=useState(false),[navigation,setNavigation]=useState<{scope:string;cursors:(string|null)[]}>({scope:'',cursors:[null]}),scope=tab+unfinished,cursors=navigation.scope===scope?navigation.cursors:[null];
 const q=new URLSearchParams({pending:unfinished?'1':'0'});if(cursors.at(-1))q.set('cursor',cursors.at(-1)!);
 const setups=useOperatorRead('/api/v1/operator/enrollment-tokens?'+q,validSetups,10000,tab==='setups'),operations=useOperatorRead('/api/v1/operator/fleet-operations?'+q,validOperations,10000,tab==='operations'),command=useOperatorCommand(15000,undefined,t.errors),read=tab==='setups'?setups:operations,locked=command.busy||command.uncertain;
 return <FleetDialog title={t.activity} help={t.activityHelp} close={close} locked={locked}>
  <div className="tw-seg" role="group" aria-label={t.actions}><button type="button" className="tw-seg__opt" disabled={locked} aria-pressed={tab==='setups'} onClick={()=>setTab('setups')}>{t.pendingSetups}</button><button type="button" className="tw-seg__opt" disabled={locked} aria-pressed={tab==='operations'} onClick={()=>setTab('operations')}>{t.recentOperations}</button></div>
  <label className="tw-check"><input type="checkbox" checked={unfinished} disabled={locked} onChange={e=>setUnfinished(e.target.checked)}/>{t.unfinishedOnly}</label>
  {read.failed?<p role="alert">{messages.fleet.unavailable}</p>:!read.value?<p role="status">{t.activityLoading}</p>:tab==='setups'?setups.value?.setups.length?<DataTable className="tw-table--edge-align tw-table--wrap-headings" columns={[{key:'name',label:t.server},{key:'state',label:t.codeState},{key:'expires',label:t.expiresAt},{key:'actions',label:t.actions}]} rows={setups.value.setups.map(s=>({name:s.label,state:resultLabel(s.state),expires:time(s.expires_at,true),actions:s.state==='pending'?<PlaybookButton variant="secondary" type="button" className="tw-btn--sm" disabled={locked||read.busy} onClick={()=>void command.send(`/api/v1/operator/enrollment-tokens/${s.id}/revoke`,{request_id:undefined},setups.reload)}>{t.cancelCode}</PlaybookButton>:null}))}/>:<EmptyState title={t.noSetups}/>:operations.value?.operations.length?<DataTable className="tw-table--edge-align" columns={[{key:'kind',label:t.operation},{key:'created',label:t.issuedAt},{key:'actions',label:t.actions}]} rows={operations.value.operations.map(o=>({kind:resultLabel(o.kind),created:time(o.created_at,true),actions:<PlaybookButton variant="secondary" type="button" className="tw-btn--sm" onClick={()=>showOperation(o.id)}>{t.details}</PlaybookButton>}))}/>:<EmptyState title={t.noOperations}/>}
  {read.value?<div className="tw-fleet-toolbar"><span className="tw-meta">{text(t.activityCount,{count:read.value.total})}</span><div className="tw-btns"><PlaybookButton variant="secondary" type="button" className="tw-btn--sm" disabled={locked||read.busy||cursors.length===1} onClick={()=>setNavigation({scope,cursors:cursors.slice(0,-1)})}>{t.previous}</PlaybookButton><PlaybookButton variant="secondary" type="button" className="tw-btn--sm" disabled={locked||read.busy||!read.value.next_cursor} onClick={()=>setNavigation({scope,cursors:[...cursors,read.value?.next_cursor??null]})}>{t.next}</PlaybookButton></div></div>:null}
  <CommandNotice command={command}/>
 </FleetDialog>;
}
