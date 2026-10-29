"use client";
import type {MouseEventHandler,ReactNode} from 'react';
import {messages} from '@/i18n/messages';
import {RowStatus} from './controls';
import {PlaybookIcon} from './skill';

/** Compact, secondary operation context for table cells and skill action bars. */
export function ActionActivity({name,attention=false,running=true,onProgress}:{name:string;attention?:boolean;running?:boolean;onProgress?:MouseEventHandler<HTMLButtonElement>|undefined}){
 return <div className="tw-action-activity">
  <RowStatus status={attention?'warning':running?'running':'off'} value={name}/>
  {onProgress?<button type="button" className="tw-link tw-action-activity__progress" onClick={onProgress}><PlaybookIcon name="book"/>{messages.skillActions.viewProgress}</button>:null}
 </div>;
}
export function SkillActionBar({children}:{children:ReactNode}){
 return <div className="tw-skill__slot tw-skill__slot--pad tw-skill-actionbar" role="group" aria-label={messages.skillActions.title}>{children}</div>;
}
