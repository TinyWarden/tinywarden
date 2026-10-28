"use client";
import {useId,useState,type ReactNode} from 'react';
import {messages} from '@/i18n/messages';
import {SettingsDialog,PlaybookIcon} from '@/components/playbook/skill';
import {PlaybookButton,StatePill} from '@/components/playbook/controls';
import {FactRows} from '@/components/playbook/data';

type Props={name:string|null;server?:string|null|undefined;status:string;tone:Parameters<typeof StatePill>[0]['status'];
 message:ReactNode;facts:{key:string;label:string;value:ReactNode}[];close:()=>void;open?:boolean;
 notice?:ReactNode;troubleshooting?:ReactNode;attention?:boolean;settled?:boolean;children?:ReactNode;
 cancel?:(()=>void)|undefined;cancelDisabled?:boolean;pending?:boolean};
/** One persistent shell for independently declared, single-server skill actions. */
export function ActionProgressDialog({name,server,status,tone,message,facts,close,open=true,notice,troubleshooting,
 attention=false,settled=false,children,cancel,cancelDisabled=false,pending=false}:Props){
 const [expanded,setExpanded]=useState(false),id=useId(),t=messages.skillActionProgress;
 return <SettingsDialog title={name||<span className="tw-action-progress__placeholder" aria-label={t.loading}/>} meta={messages.fleetManagement.title}
  help={<span className="tw-action-progress__server">{server?<><PlaybookIcon name="server"/>{server}</>:<span className="tw-action-progress__placeholder" aria-hidden="true"/>}</span>}
  close={close} open={open} step="progress" className="tw-dialog--action-progress">
  <div className="tw-dialog__body tw-action-progress__body">
   <div className="tw-action-progress__status" role="status" aria-atomic="true"><StatePill status={tone} value={status}/><p>{message}</p></div>
   {notice}
   <div className="tw-action-progress__results" aria-busy={pending}><FactRows facts={facts}/></div>
   {attention&&troubleshooting?<p className="tw-action-progress__attention"><button className="tw-link" type="button" onClick={()=>setExpanded(true)}>{t.reviewTroubleshooting}</button></p>:null}
   {troubleshooting?<section id={id} className="tw-action-progress__troubleshooting" aria-label={t.troubleshooting} hidden={!expanded}>{troubleshooting}</section>:null}
   {children}
  </div>
  <footer className="tw-dialog__foot tw-action-progress__foot">
   {troubleshooting?<button className="tw-textbtn tw-action-progress__utility" type="button" aria-expanded={expanded} aria-controls={id} onClick={()=>setExpanded(!expanded)}><PlaybookIcon name={expanded?'chevron-up':'chevron-down'}/>{t.troubleshooting}</button>:settled?<span className="tw-action-progress__utility tw-t-secondary"><PlaybookIcon name="check"/>{t.saved}</span>:<span className="tw-action-progress__utility"/>}
   <div className="tw-action-progress__actions">{cancel?<PlaybookButton type="button" variant="secondary" disabled={cancelDisabled} onClick={cancel}>{messages.skillActions.cancel}</PlaybookButton>:null}<PlaybookButton type="button" variant="secondary" onClick={close}><PlaybookIcon name="close"/>{messages.fleetManagement.close}</PlaybookButton></div>
  </footer>
 </SettingsDialog>;
}
