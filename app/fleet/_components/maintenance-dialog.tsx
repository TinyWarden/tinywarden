"use client";
import {useState} from 'react';
import {messages} from '@/i18n/messages';
import {useOperatorRead} from '@/components/operator/use-operator-read';
import {useOperatorCommand} from '@/components/operator/use-operator-command';
import {PlaybookButton,RowStatus,StatePill} from '@/components/playbook/controls';
import {DataTable,FactGrid} from '@/components/playbook/data';
import {text,time} from '@/components/operator/format';
import {terminalMaintenance,maintenanceActions,registeredAction} from '@/lib/maintenance/policy';
import {FleetDialog,CommandNotice} from './fields';
import {PlanReview} from './plan-review';
import {ApprovalReview,CancellationReview} from './maintenance-confirm';
import {MaintenanceRecovery,type RecoverySecret} from './maintenance-recovery';
import {MaintenanceResult} from './maintenance-results';
import {validMaintenanceOperation,approvable,cancellable,phaseLabel,maintenanceReason,type MaintenanceItem} from './maintenance-model';

const t=messages.maintenanceActions;
type Step={kind:'progress'}|{kind:'plan';id:string}|{kind:'approve'}|{kind:'cancel'}|{kind:'recover'|'acknowledge';job:string};
type Selection={plan_id:string;digest:string};
const tone=(i:MaintenanceItem)=>i.attention||i.state==='failed'||['failed','blocked','expired'].includes(i.phase??'')?'warning':i.phase==='succeeded'||i.phase==='no_changes'?'healthy':i.phase==='cancelled'?'off':'running';
export function MaintenanceDialog({id,close}:{id:string;close:()=>void}){
 const read=useOperatorRead('/api/v1/operator/fleet/maintenance/'+encodeURIComponent(id),validMaintenanceOperation,2000),v=read.value;
 const command=useOperatorCommand(15000,undefined,{...messages.fleetManagement.errors,...t.errors}),locked=command.busy||command.uncertain;
 const requiresApproval=!!v&&registeredAction(maintenanceActions,v.operation.action)?.requires_approval;
 const [step,setStep]=useState<Step>({kind:'progress'}),[selection,setSelection]=useState<Map<string,Selection>>(new Map()),[canary,setCanary]=useState(''),[confirmed,setConfirmed]=useState(false),[secret,setSecret]=useState<RecoverySecret|null>(null);
 const ready=v?.items.filter(i=>approvable(i,v.as_of))??[],stopping=v?.items.filter(cancellable)??[];
 const selected=v?.items.filter(i=>i.job_id&&selection.has(i.job_id))??[];
 const changed=selection.size!==selected.length||selected.some(i=>!approvable(i,v!.as_of)||selection.get(i.job_id!)?.plan_id!==i.plan_id||selection.get(i.job_id!)?.digest!==i.digest);
 const first=selected.find(i=>i.job_id===canary)??selected[0],ordered=first?[first,...selected.filter(i=>i.job_id!==first.job_id)]:[];
 const execution=new Map(v?.approvals.flatMap(a=>a.targets).map((target,index)=>[target.job_id,index+1]));
 const progressItems=v?[...v.items].sort((a,b)=>(execution.get(a.job_id??'')??1000+(a.ordinal??100))-(execution.get(b.job_id??'')??1000+(b.ordinal??100))):[];
 const unavailable=locked||read.busy||read.failed||read.expired||!v;
 const target=step.kind==='recover'||step.kind==='acknowledge'?v?.items.find(i=>i.job_id===step.job):undefined;
 const recovery=target?v?.recoveries.find(r=>r.id===target.recovery_id):undefined;
 const mayRecover=(i:MaintenanceItem)=>!!i.job_id&&!i.recovery_pending&&(i.attention||!!i.delivered_at&&!!i.phase&&!terminalMaintenance(i.phase));
 const mayAcknowledge=(i:MaintenanceItem)=>!!i.job_id&&!!i.phase&&terminalMaintenance(i.phase)&&i.attention&&!i.process_running&&!i.recovery_pending&&(!!i.reconciled_at||i.result?.local_verified);
 function move(next:Step){if(locked)return;command.clearNotice();setStep(next);setConfirmed(false);setSecret(null);}
 function toggle(i:MaintenanceItem,checked:boolean){setSelection(old=>{const next=new Map(old);if(checked&&i.job_id&&i.plan_id&&i.digest)next.set(i.job_id,{plan_id:i.plan_id,digest:i.digest});else next.delete(i.job_id!);return next;});}
 async function approve(){if(changed||!ordered.length||!confirmed||unavailable)return;
  await command.send('/api/v1/operator/fleet/maintenance/approve',{operation_id:id,targets:ordered.map(i=>({job_id:i.job_id,plan_id:i.plan_id,digest:i.digest}))},read.reload,()=>{setSelection(new Map());move({kind:'progress'});});
 }
 async function control(action:'cancel'|'acknowledge',items:MaintenanceItem[]){if(unavailable||!items.length)return;
  await command.send('/api/v1/operator/fleet/maintenance/control',{operation_id:id,action,targets:items.map(i=>({job_id:i.job_id,revision:i.revision}))},read.reload,()=>move({kind:'progress'}));
 }
 async function issue(){if(!target||!mayRecover(target)||!confirmed||unavailable)return;
  await command.send(`/api/v1/operator/fleet/maintenance/${id}/recovery`,{operation_id:id,job_id:target.job_id,revision:target.revision},read.reload,value=>{
   const r=value as {recovery_id?:unknown;token?:unknown;expires_at?:unknown;scope?:{job_id?:unknown;operation_id?:unknown;host_id?:unknown}};
   if(typeof r.recovery_id!=='string'||typeof r.expires_at!=='string'||!Number.isFinite(Date.parse(r.expires_at))||r.token!==null&&(typeof r.token!=='string'||!/^tw_recovery_v1\.[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(r.token)))throw new Error('maintenance_receipt_invalid');
   if(r.scope?.job_id!==target.job_id||r.scope?.operation_id!==id||r.scope?.host_id!==target.host_id||typeof r.token==='string'&&r.token.split('.')[1]!==r.recovery_id)throw new Error('maintenance_scope_changed');
   setSecret({id:r.recovery_id,expires_at:r.expires_at,token:r.token as string|null});setConfirmed(false);
  });
 }
 const title=step.kind==='approve'?t.approveTitle:step.kind==='cancel'?t.cancelTitle:step.kind==='recover'?t.recovery:step.kind==='acknowledge'?t.acknowledge:step.kind==='plan'?t.review:v?t.actions[v.operation.action as keyof typeof t.actions]:t.progress;
 const help=step.kind==='approve'?t.approveHelp:step.kind==='cancel'?t.cancelHelp:step.kind==='recover'?t.recoveryHelp:step.kind==='acknowledge'?t.acknowledgeHelp:step.kind==='plan'?t.reviewHelp:t.progressHelp;
 const actions=step.kind==='approve'?<PlaybookButton type="button" disabled={unavailable||changed||!ordered.length||!confirmed} onClick={()=>void approve()}>{ordered.length===1?t.approveOne:text(t.approveCount,{count:ordered.length})}</PlaybookButton>
  :step.kind==='cancel'?<PlaybookButton type="button" variant="danger" disabled={unavailable||!stopping.length} onClick={()=>void control('cancel',stopping)}>{t.cancel}</PlaybookButton>
  :step.kind==='acknowledge'?<PlaybookButton type="button" disabled={unavailable||!target||!mayAcknowledge(target)} onClick={()=>void control('acknowledge',[target!])}>{t.acknowledge}</PlaybookButton>
  :step.kind==='recover'?<>{recovery&&!recovery.accepted_at&&!recovery.revoked_at&&Date.parse(recovery.expires_at)>Date.parse(v!.as_of)?<PlaybookButton type="button" variant="secondary" disabled={unavailable} onClick={()=>void command.send(`/api/v1/operator/fleet/maintenance/recovery/${recovery.id}/revoke`,{request_id:undefined},read.reload,()=>setSecret(null))}>{t.revokeRecovery}</PlaybookButton>:null}{target&&mayRecover(target)?<PlaybookButton type="button" disabled={unavailable||!confirmed} onClick={()=>void issue()}>{recovery?t.replaceRecovery:t.createRecovery}</PlaybookButton>:null}</>
  :step.kind==='progress'?<>{stopping.length?<PlaybookButton variant="secondary" type="button" disabled={unavailable} onClick={()=>move({kind:'cancel'})}>{t.cancel}</PlaybookButton>:null}{ready.length||selection.size?<PlaybookButton type="button" disabled={unavailable||changed||!selected.length} onClick={()=>move({kind:'approve'})}>{t.approve}</PlaybookButton>:null}</>:undefined;
 const current=v?.items.find(i=>i.attention)??v?.items.find(i=>i.phase&&!terminalMaintenance(i.phase));
 const issues=v?.items.filter(i=>i.state==='failed'||['failed','blocked','expired'].includes(i.phase??'')).length??0;
 return <FleetDialog title={title} help={help} close={close} locked={locked} size="wide" step={step.kind+(step.kind==='plan'?step.id:step.kind==='recover'||step.kind==='acknowledge'?step.job:'')} {...(actions===undefined?{}:{actions})}
  leading={step.kind==='progress'||read.failed?<PlaybookButton variant="secondary" type="button" className="tw-btn--sm" disabled={read.busy||locked} onClick={()=>void read.reload()}>{t.refreshView}</PlaybookButton>:null}
  {...(step.kind==='progress'?{}:{cancel:()=>move({kind:'progress'}),cancelLabel:t.back})}>
  {!v?<p role={read.failed?'alert':'status'}>{read.failed?t.unavailable:t.loading}</p>:<>
   {read.failed?<p role="alert">{t.unavailable}</p>:null}
   {changed?<p role="alert">{t.selectionChanged}</p>:null}
   {step.kind==='plan'?<PlanReview key={step.id} operation={id} id={step.id}/>:step.kind==='approve'?<ApprovalReview policy={t.policies[v.operation.action as keyof typeof t.policies]} items={ordered} asOf={v.as_of} excluded={v.items.filter(i=>!i.job_id||!selection.has(i.job_id))} review={plan=>move({kind:'plan',id:plan})} canary={first?.job_id??''} change={setCanary} confirmed={confirmed} confirm={setConfirmed} locked={unavailable}/>:step.kind==='cancel'?<CancellationReview items={stopping}/>:step.kind==='recover'&&target?<MaintenanceRecovery asOf={v.as_of} key={target.job_id} label={target.label} recovery={recovery} secret={secret} confirmed={confirmed} confirm={setConfirmed} locked={unavailable}/>:step.kind==='acknowledge'&&target?<><strong>{target.label}</strong><MaintenanceResult item={target}/></>:<>
    <div className="tw-fleet-summary" role="status"><StatePill status={current?.attention?'warning':current?'informational':issues?'warning':'healthy'} value={current?.attention?t.attention:current?phaseLabel(current):issues?t.completedWithIssues:t.completed}/></div>
    <FactGrid facts={[{key:'total',label:t.total,value:v.items.length},{key:'ready',label:t.plans,value:ready.length},{key:'done',label:t.completed,value:v.items.filter(i=>i.phase==='succeeded'||i.phase==='no_changes').length},{key:'attention',label:t.attention,value:v.items.filter(i=>i.attention||['failed','blocked','expired'].includes(i.phase??'')).length}]}/>
    {selection.size?<div className="tw-fleet-toolbar"><strong>{selection.size===1?t.readyOne:text(t.readyCount,{count:selection.size})}</strong><PlaybookButton variant="secondary" type="button" className="tw-btn--sm" disabled={locked} onClick={()=>setSelection(new Map())}>{t.clearSelection}</PlaybookButton></div>:null}
    <DataTable className="tw-table--edge-align tw-table--wrap-headings tw-table--stack tw-table--selection tw-table--labelled" columns={[
     ...(requiresApproval?[{key:'select',label:t.selectReady,utility:true,heading:<input type="checkbox" aria-label={t.selectReady} disabled={unavailable||!ready.length} checked={!!ready.length&&ready.every(i=>selection.has(i.job_id!))} onChange={e=>setSelection(e.target.checked?new Map(ready.map(i=>[i.job_id!,{plan_id:i.plan_id!,digest:i.digest!}])):new Map())}/>}]:[]),
     {key:'server',label:t.server},{key:'state',label:t.status},{key:'review',label:t.plans},{key:'actions',label:t.actionsLabel}
    ]} rows={progressItems.map(i=>({select:i.job_id&&approvable(i,v.as_of)?<input type="checkbox" aria-label={text(t.selectPlan,{name:i.label})} disabled={unavailable} checked={selection.has(i.job_id)} onChange={e=>toggle(i,e.target.checked)}/>:null,
     server:<div><strong>{i.label}</strong>{execution.has(i.job_id??'')?<p className="tw-meta">{text(t.executionPosition,{position:execution.get(i.job_id!)!})}</p>:null}</div>,state:<div><RowStatus status={tone(i)} value={phaseLabel(i)}/>{i.reason||!i.job_id&&i.outcome?<p className="tw-t-secondary">{maintenanceReason(i.reason??i.outcome)}</p>:null}{i.cancel_requested?<p className="tw-t-secondary">{t.pendingCancellation}</p>:null}</div>,
     review:i.plan_id?<div><PlaybookButton type="button" variant="secondary" className="tw-btn--sm" disabled={locked} onClick={()=>move({kind:'plan',id:i.plan_id!})}>{t.review}</PlaybookButton><p className="tw-meta">{time(i.plan_expires_at,true)}</p></div>:null,
     actions:<div className="tw-btns">{mayRecover(i)||i.recovery_id?<PlaybookButton variant="secondary" type="button" className="tw-btn--sm" disabled={unavailable} onClick={()=>move({kind:'recover',job:i.job_id!})}>{t.recovery}</PlaybookButton>:null}{mayAcknowledge(i)?<PlaybookButton type="button" variant="secondary" className="tw-btn--sm" disabled={unavailable} onClick={()=>move({kind:'acknowledge',job:i.job_id!})}>{t.acknowledge}</PlaybookButton>:null}{i.result?<details><summary>{t.result}</summary><MaintenanceResult item={i}/></details>:null}</div>}))}/>
    {!ready.length&&requiresApproval?<p>{t.noPlansHelp}</p>:null}
   </>}
  </>}
  <CommandNotice command={command}/>
 </FleetDialog>;
}
