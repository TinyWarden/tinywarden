"use client";
import type {ComponentProps,MouseEventHandler,ReactNode} from 'react';
import {messages} from '@/i18n/messages';
import {RowStatus} from './controls';
import {PlaybookIcon} from './skill';
import {ActionMenu} from './action-menu';
import {time,compactDashboardTime} from '@/components/operator/format';
import type {OperationActivityState} from '@/lib/maintenance/operation-summary';

/** Shared skill operations use the same positioned, keyboard-accessible menu. */
export function SkillOperations({items}:{items:ComponentProps<typeof ActionMenu>['items']}){
 return items.length?<ActionMenu label={messages.skillActions.operations} icon={<PlaybookIcon name="chevron-down"/>} items={items}/>:null;
}

/** Compact, secondary operation context for table cells and skill action bars. */
export function ActionActivity({name,attention=false,running=true,onProgress,onDismiss,dismissDisabled=false,notice,verificationRequired=false,state,at,receipt=false}:{name:string;verificationRequired?:boolean;attention?:boolean;running?:boolean;state?:OperationActivityState|undefined;at?:string|null|undefined;receipt?:boolean;onProgress?:MouseEventHandler<HTMLButtonElement>|undefined;onDismiss?:MouseEventHandler<HTMLButtonElement>|undefined;dismissDisabled?:boolean;notice?:ReactNode}){
 const t=messages.skillActions,value=verificationRequired?'verification':state;
 const link=value==='verification'?t.verifyUnlock:value==='review'?t.reviewPlan:value==='completed'||value==='failed'||value==='cancelled'?t.viewResult:t.viewProgress;
 const label=value?({verification:t.verificationRequired,review:t.readyForReview,completed:t.done,failed:t.failed,cancelled:t.cancelled,running:t.working})[value]:verificationRequired?t.verificationRequired:name;
 const status=value==='completed'?'healthy':value==='verification'||value==='failed'||attention?'warning':value==='cancelled'?'off':value==='review'||value==='running'||running?'running':'off';
 const progress=onProgress?<button type="button" className="tw-link tw-action-activity__progress" onClick={onProgress}><PlaybookIcon name="book"/>{link}</button>:null;
 const dismiss=onDismiss&&receipt&&!attention&&['completed','failed','cancelled'].includes(value??'')?<button type="button" className="tw-iconbtn" disabled={dismissDisabled} aria-label={t.dismissResult} title={t.dismissResult} onClick={onDismiss}><PlaybookIcon name="close"/></button>:null;
 return <div className={`tw-action-activity${receipt?' tw-action-activity--receipt':''}`} title={name}>
  <div className="tw-action-activity__summary">{receipt?<span className="tw-action-activity__name">{name}</span>:null}<RowStatus status={status} value={label}/>{at?<time className="tw-action-activity__time" dateTime={at} title={time(at,true)}>{compactDashboardTime(Date.parse(at),new Date().toISOString()).label}</time>:null}</div>
  {dismiss?<div className="tw-action-activity__tools">{progress}{dismiss}</div>:progress}
  {notice}
 </div>;
}
export function SkillActionBar({children}:{children:ReactNode}){
 return <div className="tw-skill__slot tw-skill__slot--pad tw-skill-actionbar" role="group" aria-label={messages.skillActions.title}>{children}</div>;
}
