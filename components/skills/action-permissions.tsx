"use client";
import {useState} from 'react';
import {messages} from '@/i18n/messages';
import {packageText} from '@/lib/skills/package-types';
import {useOperatorRead} from '@/components/operator/use-operator-read';
import {useOperatorCommand} from '@/components/operator/use-operator-command';
import {SettingsDialog} from '@/components/playbook/skill';
import {DataTable} from '@/components/playbook/data';
import {PlaybookButton,RowStatus} from '@/components/playbook/controls';
import {validActionGrants,type ActionGrantRead} from './action-model';
import {ActionPermissionReview} from './action-permission-review';

const t=messages.skillActions;
export function ActionPermissions({id}:{id:string}){
 const read=useOperatorRead(`/api/v2/operator/skills/${id}/actions`,validActionGrants,30000);
 const command=useOperatorCommand(15000,undefined,{...messages.marketplace.errors,...messages.maintenanceActions.errors});
 const [review,setReview]=useState<{id:string;digest:string;descriptor:string;revision:string}|null>(null),[confirmed,setConfirmed]=useState(false);
 const value=read.value,selected=review&&value?.content_sha256===review.digest?value.actions.find(a=>a.snapshot.descriptor.id===review.id&&a.snapshot.descriptor_sha256===review.descriptor&&a.revision===review.revision):undefined,locked=command.busy||command.uncertain;
 async function change(action:ActionGrantRead['actions'][number],enabled:boolean){
  if(!value||enabled&&!confirmed)return;
  await command.send(`/api/v2/operator/skills/${id}/actions`,{content_sha256:value.content_sha256,
   action_id:action.snapshot.descriptor.id,descriptor_sha256:action.snapshot.descriptor_sha256,expected_revision:action.revision,enabled},read.reload,()=>{setReview(null);setConfirmed(false);});
 }
 const close=()=>{if(!locked){setReview(null);setConfirmed(false);}};
 return <section className="tw-card"><div className="tw-card__body tw-form-body"><h3 className="tw-t-head">{t.title}</h3><p>{t.help}</p>
  {!value||read.failed?<p role={read.failed?'alert':'status'}>{read.failed?t.unavailable:t.loading}</p>:value.actions.length?<DataTable className="tw-table--edge-align tw-table--wrap-headings tw-table--stack tw-table--labelled"
   columns={[{key:'action',label:messages.maintenanceReadiness.action},{key:'permission',label:t.permission},{key:'state',label:messages.maintenanceActions.status},{key:'manage',label:messages.fleetManagement.actions}]}
   rows={value.actions.map(a=>({action:<div><strong>{packageText(a.snapshot.catalog,{key:a.snapshot.descriptor.name_key,params:{}})}</strong><p>{packageText(a.snapshot.catalog,{key:a.snapshot.descriptor.description_key,params:{}})}</p></div>,
    permission:a.snapshot.descriptor.execution_class==='host_admin'?t.administrator:t.standard,
    state:<RowStatus status={a.enabled?'off':'not_configured'} value={a.enabled?t.approved:t.notApproved}/>,
    manage:<PlaybookButton type="button" variant="secondary" className="tw-btn--sm" disabled={locked||read.expired||read.failed} onClick={()=>a.enabled?void change(a,false):(setReview({id:a.snapshot.descriptor.id,digest:value.content_sha256,descriptor:a.snapshot.descriptor_sha256,revision:a.revision}),setConfirmed(false))}>{a.enabled?t.revoke:t.allow}</PlaybookButton>}))}/>:<p>{t.empty}</p>}
  {review&&!selected?<p className="tw-notice" role="alert">{t.changed}</p>:null}
  {command.notice?<p className="tw-notice" role="status">{command.notice}</p>:null}
  {command.uncertain?<PlaybookButton type="button" variant="secondary" disabled={command.busy} onClick={()=>void command.retry(read.reload)}>{messages.fleetManagement.retry}</PlaybookButton>:null}
 </div>{selected&&value?<SettingsDialog title={t.review} meta={t.title} help={t.help} close={close} locked={locked} step="permission">
  <div className="tw-dialog__body tw-form-body"><ActionPermissionReview snapshot={selected.snapshot} confirmed={confirmed} confirm={setConfirmed} locked={locked}/>
   {command.notice?<p className="tw-notice" role="status">{command.notice}</p>:null}
  </div><footer className="tw-dialog__foot"><PlaybookButton type="button" variant="secondary" disabled={locked} onClick={close}>{messages.fleetManagement.close}</PlaybookButton><PlaybookButton type="button" disabled={locked||!confirmed||read.expired} onClick={()=>void change(selected,true)}>{t.allow}</PlaybookButton></footer>
 </SettingsDialog>:null}</section>;
}
