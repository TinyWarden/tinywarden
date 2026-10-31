"use client";
import {useEffect,useState} from 'react';
import {messages} from '@/i18n/messages';
import {PlaybookButton,RowStatus,StatePill,WidgetState} from './controls';
import {DataTable,FactGrid} from './data';
import {MaintenanceReadiness} from '@/components/operator/maintenance-readiness';
import {SettingsDialog,PlaybookIcon} from './skill';
import {ActionActivity} from './action-activity';
import {ActionProgressDialog} from '@/components/skills/action-progress';
import {ActionLogView,OperationLogPanel,actionTranscriptText} from '@/components/skills/action-log';
import type {ActionLogRow} from '@/lib/maintenance/action-log';

const t=messages.maintenanceActions;
const demoLogRows:ActionLogRow[]=[
 {id:'command',at:'2026-01-01T10:00:00Z',level:'info',phase:'prepare',stage:null,code:null,message:null,output:{stream:'command',text:'$ example-tool --check\n'}},
 {id:'stdout',at:'2026-01-01T10:00:01Z',level:'info',phase:'prepare',stage:null,code:null,message:null,output:{stream:'stdout',text:'Checked 12 items.\n'}},
 {id:'completed',at:'2026-01-01T10:00:02Z',level:'info',phase:'prepare',stage:null,code:null,message:null,output:{stream:'exit',text:'[exit 0]\n'}}
];
function demoDownload(){const url=URL.createObjectURL(new Blob([actionTranscriptText(demoLogRows)],{type:'text/plain'})),link=document.createElement('a');link.href=url;link.download='example.log';link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
function DemoOperationLog({running}:{running:boolean}){
 const [expanded,setExpanded]=useState(false),[notice,setNotice]=useState(''),l=messages.operationLog;
 async function copy(){try{await navigator.clipboard.writeText(actionTranscriptText(demoLogRows));setNotice(l.copied);}catch{setNotice(l.copyFailed);}}
 return <OperationLogPanel expanded={expanded} onExpanded={setExpanded} live={running}
  copy={<div className="tw-action-log__exports"><PlaybookButton type="button" variant="secondary" className="tw-btn--sm tw-action-log__copy" aria-label={l.copy} onClick={()=>void copy()}><PlaybookIcon name={notice===l.copied?'check':'copy'}/><span className="tw-action-log__copy-label">{notice===l.copied?l.copiedShort:l.copyShort}</span><span className="sr-only" role="status">{notice===l.copied?notice:''}</span></PlaybookButton><PlaybookButton type="button" variant="secondary" className="tw-btn--sm" aria-label={l.download} onClick={demoDownload}><PlaybookIcon name="download"/><span className="tw-action-log__copy-label">{l.downloadShort}</span></PlaybookButton></div>}>
  {notice===l.copyFailed?<p role="status">{notice}</p>:null}
  <ActionLogView latest={running?'completed':undefined} rows={demoLogRows}/>
 </OperationLogPanel>;
}
/** Gallery-only interaction: shared statuses, labelled changes and one advancing dialog. */
export function MaintenanceExample(){
 const [simpleRunning,setSimpleRunning]=useState(false);
 const [simpleDone,setSimpleDone]=useState(false);
 const [approvalPhase,setApprovalPhase]=useState<'preparing'|'awaiting_approval'|'applying'|'succeeded'>('preparing');
 useEffect(()=>{if(approvalPhase!=='preparing'&&approvalPhase!=='applying')return;const timer=setTimeout(()=>setApprovalPhase(approvalPhase==='preparing'?'awaiting_approval':'succeeded'),3000);return()=>clearTimeout(timer);},[approvalPhase]);
 useEffect(()=>{if(!simpleRunning||simpleDone)return;const timer=setTimeout(()=>setSimpleDone(true),5000);return()=>clearTimeout(timer);},[simpleRunning,simpleDone]);
 const [selected,setSelected]=useState(false),[open,setOpen]=useState(false),[step,setStep]=useState('review'),[confirmed,setConfirmed]=useState(false);
 const close=()=>{setOpen(false);setStep('review');setConfirmed(false);};
 return <section className="tw-card"><div className="tw-card__body tw-form-body">
  <MaintenanceReadiness value={{observed_at:null,valid_until:null,actions:[
   {id:'packages.refresh.v1',state:'ready',missing_packages:[]},
   {id:'packages.upgrade_conservative.v1',state:'missing_prerequisites',missing_packages:['python3-apt']},
   {id:'example.retired.v1',name:messages.maintenanceReadiness.retiredExample,state:'retired_policy',missing_packages:[]}
  ]}}/>
  <div className="tw-btns"><PlaybookButton type="button" onClick={()=>{setSimpleRunning(true);setSimpleDone(false);setStep('simple');setOpen(true);}}>{messages.skillActions.simpleDemo}</PlaybookButton>{simpleRunning?<><RowStatus status={simpleDone?'healthy':'running'} value={simpleDone?messages.skillActions.done:messages.skillActions.running}/><PlaybookButton type="button" variant="secondary" onClick={()=>{setStep('simple');setOpen(true);}}>{messages.skillActions.viewProgress}</PlaybookButton></>:null}</div>
  <ActionActivity name={messages.skillActions.simpleDemo} verificationRequired onProgress={()=>{setStep('verification');setOpen(true);}}/>
  <h3 className="tw-t-head">{t.demoTitle}</h3><p>{t.demoHelp}</p>
  <div className="tw-btns"><PlaybookButton type="button" onClick={()=>{setApprovalPhase('preparing');setStep('approvalSimple');setOpen(true);}}>{messages.skillActionProgress.approvalDemo}</PlaybookButton><PlaybookButton type="button" variant="secondary" onClick={()=>{setStep('approvalSimple');setOpen(true);}}>{messages.skillActions.viewProgress}</PlaybookButton></div>
  <div className="tw-btns"><StatePill status="informational" value={t.phases.awaiting_approval}/></div>
  <FactGrid facts={[{key:'server',label:t.server,value:messages.resources.demoName},{key:'plans',label:t.plans,value:1}]}/>
  <DataTable className="tw-table--edge-align tw-table--stack tw-table--selection tw-table--labelled" columns={[{key:'select',label:t.selectReady,utility:true,heading:<input type="checkbox" aria-label={t.selectReady} checked={selected} onChange={e=>setSelected(e.target.checked)}/>},{key:'server',label:t.server},{key:'state',label:t.status},{key:'review',label:t.review}]} rows={[{select:<input type="checkbox" aria-label={t.selectPlan.replace('{name}',messages.resources.demoName)} checked={selected} onChange={e=>setSelected(e.target.checked)}/>,server:messages.resources.demoName,state:<RowStatus status="off" value={t.ready}/>,review:<PlaybookButton type="button" variant="secondary" onClick={()=>setOpen(true)}>{t.review}</PlaybookButton>}]}/>
  <div className="tw-btns"><PlaybookButton type="button" variant="secondary" onClick={()=>{setStep('result');setOpen(true);}}>{t.result}</PlaybookButton><PlaybookButton type="button" variant="secondary" onClick={()=>{setStep('empty');setOpen(true);}}>{t.phases.no_changes}</PlaybookButton></div>
 </div>{open&&step==='verification'?<ActionProgressDialog name={messages.skillActions.simpleDemo} server={messages.resources.demoName} close={close} status={messages.skillActions.verificationRequired} tone="warning" message={messages.skillActions.verificationHelp} facts={[]} primaryAction={<PlaybookButton type="button" onClick={close}><PlaybookIcon name="book"/>{messages.skillActions.verifyUnlock}</PlaybookButton>}/>:open&&step==='approvalSimple'?<ActionProgressDialog name={messages.skillActionProgress.approvalDemo} server={messages.resources.demoName} close={close} approval settled={approvalPhase==='succeeded'}
  status={t.phases[approvalPhase]} tone={approvalPhase==='succeeded'?'healthy':'informational'} message={approvalPhase==='awaiting_approval'?messages.skillActionProgress.reviewReady:approvalPhase==='succeeded'?messages.skillActionProgress.completed:messages.skillActionProgress.running}
  footerNotice={approvalPhase==='awaiting_approval'?messages.skillActionProgress.approvalRisk:t.progressHelp}
  facts={approvalPhase==='preparing'?[]:[{key:'changes',label:t.changes,value:1}]}
  log={<DemoOperationLog running={approvalPhase==='preparing'||approvalPhase==='applying'}/>}
  review={approvalPhase==='awaiting_approval'?<DataTable className="tw-table--edge-align tw-table--wrap-headings tw-table--stack tw-table--labelled" columns={[{key:'subject',label:t.fields.package},{key:'before',label:t.fields.installedVersion},{key:'after',label:t.fields.candidateVersion}]} rows={[{subject:'example-package',before:'1.0.0-1+example1',after:'1.1.0-1+example1'}]}/>:null}
  primaryAction={approvalPhase==='awaiting_approval'?<PlaybookButton type="button" onClick={()=>setApprovalPhase('applying')}>{messages.skillActionProgress.approveRun}</PlaybookButton>:null}/>:open&&step==='simple'?<ActionProgressDialog name={messages.skillActions.simpleDemo} server={messages.resources.demoName} close={close} status={simpleDone?messages.skillActions.done:messages.skillActions.working} tone={simpleDone?'healthy':'informational'} message={simpleDone?messages.skillActionProgress.completed:messages.skillActionProgress.running} settled={simpleDone} pending={!simpleDone} facts={[
  {key:'checked',label:messages.skillActionProgress.demoChecked,value:12},
  {key:'attention',label:messages.skillActionProgress.demoAttention,value:0}
 ].filter(()=>simpleDone)} log={<DemoOperationLog running={!simpleDone}/>}/>:open?<SettingsDialog title={step==='result'?t.result:t.demoTitle} meta={t.progress} help={step==='result'?t.resultHelp:t.demoHelp} step={step} size="wide" close={close}>
  <div className="tw-dialog__body tw-form-body">{step==='empty'?<DataTable className="tw-table--edge-align tw-table--wrap-headings tw-table--stack tw-table--labelled" columns={[{key:'subject',label:t.fields.package},{key:'before',label:t.fields.installedVersion},{key:'after',label:t.fields.candidateVersion}]} rows={[]} emptyState={<WidgetState state="empty" title={t.emptyReviewTable.replace('{table}',t.changes)}>{t.noRows}</WidgetState>}/>:step==='result'?<><h3 className="tw-t-head">{messages.resources.demoName}</h3><RowStatus status="warning" value={t.phases.failed}/><p>{t.errors.maintenance_archive_method}</p><p>{t.effects.indexes_changed}</p></>:step==='progress'?<><StatePill status="informational" value={t.phases.approved}/><p>{t.demoApproved}</p></>:<>
   <DataTable className="tw-table--edge-align tw-table--wrap-headings tw-table--stack tw-table--labelled" columns={[{key:'subject',label:t.fields.package},{key:'before',label:t.fields.installedVersion},{key:'after',label:t.fields.candidateVersion},{key:'state',label:t.status}]} rows={[{subject:'example-package',before:'1.0.0',after:'1.1.0',state:<RowStatus status="off" value={t.ready}/>}]} />
   {step==='approve'?<><p>{t.disruption}</p><label className="tw-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t.approvalConfirm}</label></>:null}
  </>}</div><footer className="tw-dialog__foot"><PlaybookButton type="button" variant="secondary" onClick={close}>{messages.fleetManagement.close}</PlaybookButton>{step==='review'?<PlaybookButton type="button" onClick={()=>setStep('approve')}>{t.approve}</PlaybookButton>:step==='approve'?<PlaybookButton type="button" disabled={!confirmed} onClick={()=>setStep('progress')}>{t.approveTitle}</PlaybookButton>:null}</footer>
 </SettingsDialog>:null}</section>;
}
