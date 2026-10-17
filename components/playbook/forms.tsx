import type {ReactNode} from 'react';
import {messages} from '@/i18n/messages';
export function DisabledAction({reason,children}:{reason?:string|null;children:ReactNode}){
 return <div className="tw-disabled">{children}{reason?<span className="tw-disabled__reason">{reason}</span>:null}</div>;
}
export function InlineAlert({title,children,tone='info'}:{title:string;children?:ReactNode;tone?:'info'|'success'|'critical'|'warning'}){
 return <div className={'tw-alert tw-alert--'+tone} role={tone==='critical'?'alert':'status'}><span className="tw-alert__cue" aria-hidden="true">{tone==='success'?messages.display.checkMark:tone==='info'?messages.uiForms.infoCue:messages.uiForms.issueCue}</span><div className="tw-alert__body"><strong className="tw-alert__title">{title}</strong>{children?<span className="tw-alert__text">{children}</span>:null}</div></div>;
}
export function RequirementList({id,items}:{id:string;items:{label:string;met:boolean}[]}){
 return <ul className="tw-reqs" id={id}>{items.map(i=><li key={i.label} className={'tw-req'+(i.met?' tw-req--met':'')}><span className="tw-req__cue" aria-hidden="true">{i.met?messages.display.checkMark:messages.uiForms.pendingCue}</span><span className="tw-req__text">{i.label}</span><span className="tw-req__state">{i.met?messages.uiForms.met:messages.uiForms.notYet}</span></li>)}</ul>;
}
