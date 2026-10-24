"use client";
import {useState} from 'react';
import {messages} from '@/i18n/messages';
import {PlaybookButton,RowStatus,StatePill} from './controls';
import {DataTable,FactGrid} from './data';
import {MaintenanceReadiness} from '@/components/operator/maintenance-readiness';
import {SettingsDialog} from './skill';

const t=messages.maintenanceActions;
/** Gallery-only interaction: shared statuses, labelled changes and one advancing dialog. */
export function MaintenanceExample(){
 const [selected,setSelected]=useState(false),[open,setOpen]=useState(false),[step,setStep]=useState('review'),[confirmed,setConfirmed]=useState(false);
 const close=()=>{setOpen(false);setStep('review');setConfirmed(false);};
 return <section className="tw-card"><div className="tw-card__body tw-form-body">
  <MaintenanceReadiness value={{observed_at:null,valid_until:null,actions:[
   {id:'packages.refresh.v1',state:'ready',missing_packages:[]},
   {id:'packages.upgrade_conservative.v1',state:'missing_prerequisites',missing_packages:['python3-apt']}
  ]}}/>
  <h3 className="tw-t-head">{t.demoTitle}</h3><p>{t.demoHelp}</p>
  <div className="tw-btns"><StatePill status="informational" value={t.phases.awaiting_approval}/></div>
  <FactGrid facts={[{key:'server',label:t.server,value:messages.resources.demoName},{key:'plans',label:t.plans,value:1}]}/>
  <DataTable className="tw-table--edge-align tw-table--stack tw-table--selection tw-table--labelled" columns={[{key:'select',label:t.selectReady,utility:true,heading:<input type="checkbox" aria-label={t.selectReady} checked={selected} onChange={e=>setSelected(e.target.checked)}/>},{key:'server',label:t.server},{key:'state',label:t.status},{key:'review',label:t.review}]} rows={[{select:<input type="checkbox" aria-label={t.selectPlan.replace('{name}',messages.resources.demoName)} checked={selected} onChange={e=>setSelected(e.target.checked)}/>,server:messages.resources.demoName,state:<RowStatus status="off" value={t.ready}/>,review:<PlaybookButton type="button" variant="secondary" onClick={()=>setOpen(true)}>{t.review}</PlaybookButton>}]}/>
 </div>{open?<SettingsDialog title={t.demoTitle} meta={t.progress} help={t.demoHelp} step={step} size="wide" close={close}>
  <div className="tw-dialog__body tw-form-body">{step==='progress'?<><StatePill status="informational" value={t.phases.approved}/><p>{t.demoApproved}</p></>:<>
   <DataTable className="tw-table--edge-align tw-table--wrap-headings tw-table--stack tw-table--labelled" columns={[{key:'subject',label:t.fields.package},{key:'before',label:t.fields.installedVersion},{key:'after',label:t.fields.candidateVersion},{key:'state',label:t.status}]} rows={[{subject:'example-package',before:'1.0.0',after:'1.1.0',state:<RowStatus status="off" value={t.ready}/>}]} />
   {step==='approve'?<><p>{t.disruption}</p><label className="tw-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t.approvalConfirm}</label></>:null}
  </>}</div><footer className="tw-dialog__foot"><PlaybookButton type="button" variant="secondary" onClick={close}>{messages.fleetManagement.close}</PlaybookButton>{step==='review'?<PlaybookButton type="button" onClick={()=>setStep('approve')}>{t.approve}</PlaybookButton>:step==='approve'?<PlaybookButton type="button" disabled={!confirmed} onClick={()=>setStep('progress')}>{t.approveTitle}</PlaybookButton>:null}</footer>
 </SettingsDialog>:null}</section>;
}
