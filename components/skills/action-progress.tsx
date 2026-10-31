"use client";
import {useId,useState,type ReactNode} from 'react';
import {messages} from '@/i18n/messages';
import {SettingsDialog,PlaybookIcon} from '@/components/playbook/skill';
import {PlaybookButton,StatePill} from '@/components/playbook/controls';
import {FactRows} from '@/components/playbook/data';
import {time} from '@/components/operator/format';

type Props={name:string|null;server?:string|null|undefined;status:string;tone:Parameters<typeof StatePill>[0]['status'];
 message:ReactNode;facts:{key:string;label:string;value:ReactNode}[];close:()=>void;open?:boolean;
 notice?:ReactNode;troubleshooting?:ReactNode;attention?:boolean;settled?:boolean;children?:ReactNode;
 review?:ReactNode;footerNotice?:ReactNode;primaryAction?:ReactNode;approval?:boolean;log?:ReactNode;
 cancel?:(()=>void)|undefined;cancelDisabled?:boolean;pending?:boolean;completedAt?:string|null|undefined;history?:(()=>void)|undefined};
/** One persistent shell for independently declared, single-server skill actions. */
export function ActionProgressDialog({name,server,status,tone,message,facts,close,open=true,notice,troubleshooting,
 attention=false,settled=false,children,cancel,cancelDisabled=false,pending=false,review,footerNotice,primaryAction,approval=false,log,completedAt,history}:Props){
 const [expanded,setExpanded]=useState(false),id=useId(),t=messages.skillActionProgress;
 const approving=approval&&!settled&&!!primaryAction;
 return <SettingsDialog title={name||<span className="tw-action-progress__placeholder" aria-label={t.loading}/>} meta={settled?messages.skillActions.savedResult:messages.fleetManagement.title}
  help={<span className="tw-action-progress__server">{server?<><PlaybookIcon name="server"/>{server}</>:<span className="tw-action-progress__placeholder" aria-hidden="true"/>}</span>}
  close={close} open={open} step="progress" className={`tw-dialog--action-progress${approval?' tw-dialog--action-review':''}`}>
  <div className="tw-dialog__body tw-action-progress__body">
   <div className="tw-action-progress__status" role="status" aria-atomic="true"><StatePill status={tone} value={status}/>{completedAt?<time className="tw-action-progress__timestamp" dateTime={completedAt}>{time(completedAt,true)}</time>:null}<p>{message}</p></div>
   {notice}
   {facts.length?<div className="tw-action-progress__results" aria-busy={pending}><FactRows facts={facts}/></div>:null}
   {review}
   {log}
   {attention&&troubleshooting?<p className="tw-action-progress__attention"><button className="tw-link" type="button" onClick={()=>setExpanded(true)}>{t.reviewTroubleshooting}</button></p>:null}
   {troubleshooting?<section id={id} className="tw-action-progress__troubleshooting" aria-label={t.troubleshooting} hidden={!expanded}>{troubleshooting}</section>:null}
   {children}
  </div>
  <footer className={`tw-dialog__foot tw-action-progress__foot${approving?' tw-action-progress__foot--review':''}`}>
   {approving?<p className="tw-action-progress__footer-notice">{footerNotice}</p>:null}
   <div className="tw-action-progress__context">{history?<button type="button" className="tw-link tw-action-progress__utility" onClick={history}><PlaybookIcon name="book"/>{messages.skillActions.recentResults}</button>:settled||log?<span className="tw-action-progress__saved"><PlaybookIcon name="check"/>{t.saved}</span>:null}
    {troubleshooting?<button className="tw-textbtn tw-action-progress__utility" type="button" aria-expanded={expanded} aria-controls={id} onClick={()=>setExpanded(!expanded)}>{t.troubleshooting}</button>:null}</div>
   <div className="tw-action-progress__actions">{cancel?<PlaybookButton type="button" variant="secondary" disabled={cancelDisabled} onClick={cancel}><PlaybookIcon name="close"/>{approving?t.cancelOperation:messages.skillActions.cancel}</PlaybookButton>:null}{!approving||!cancel?<PlaybookButton type="button" variant="secondary" onClick={close}><PlaybookIcon name="close"/>{messages.fleetManagement.close}</PlaybookButton>:null}{primaryAction}</div>
  </footer>
 </SettingsDialog>;
}
