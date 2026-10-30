"use client";
import type {ComponentProps,MouseEventHandler,ReactNode} from 'react';
import {messages} from '@/i18n/messages';
import {RowStatus} from './controls';
import {PlaybookIcon} from './skill';
import {ActionMenu} from './action-menu';

/** Shared skill operations use the same positioned, keyboard-accessible menu. */
export function SkillOperations({items}:{items:ComponentProps<typeof ActionMenu>['items']}){
 return items.length?<ActionMenu label={messages.skillActions.operations} icon={<PlaybookIcon name="chevron-down"/>} items={items}/>:null;
}

/** Compact, secondary operation context for table cells and skill action bars. */
export function ActionActivity({name,attention=false,running=true,onProgress,verificationRequired=false}:{name:string;verificationRequired?:boolean;attention?:boolean;running?:boolean;onProgress?:MouseEventHandler<HTMLButtonElement>|undefined}){
 return <div className="tw-action-activity" title={name}>
  <RowStatus status={verificationRequired||attention?'warning':running?'running':'off'} value={verificationRequired?messages.skillActions.verificationRequired:name}/>
  {onProgress?<button type="button" className="tw-link tw-action-activity__progress" onClick={onProgress}><PlaybookIcon name="book"/>{verificationRequired?messages.skillActions.verifyUnlock:messages.skillActions.viewProgress}</button>:null}
 </div>;
}
export function SkillActionBar({children}:{children:ReactNode}){
 return <div className="tw-skill__slot tw-skill__slot--pad tw-skill-actionbar" role="group" aria-label={messages.skillActions.title}>{children}</div>;
}
