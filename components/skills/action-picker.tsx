"use client";
import {useEffect,useId,useRef} from 'react';
import {messages} from '@/i18n/messages';
import {text} from '@/components/operator/format';
import {EmptyState} from '@/components/playbook/controls';
import {PlaybookIcon} from '@/components/playbook/skill';
import type {SkillActionGroup,SkillActionOption} from '@/lib/skills/action-choices';

const t=messages.skillActions;
/** Shared inert choices. The owning screen supplies scope and the preparation callback. */
export function SkillActionPicker({groups,status='ready',choose}:{groups:SkillActionGroup[];status?:'ready'|'loading'|'unavailable';choose:(action:SkillActionOption)=>void}){
 const id=useId(),body=useRef<HTMLDivElement>(null),focused=useRef<string|null>(null);
 useEffect(()=>{
  if(focused.current&&!body.current?.querySelector(`[data-action-id="${focused.current}"]`)&&document.activeElement===document.body){
   body.current?.closest('dialog')?.querySelector<HTMLElement>('h2')?.focus();focused.current=null;
  }
 },[groups,status]);
 return <div ref={body} className="tw-actionpicker" onFocusCapture={e=>{const button=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-action-id]');if(button)focused.current=button.dataset.actionId??null;}}>
  {status==='unavailable'?<p role="alert">{t.pickerUnavailable}</p>:<>
   {status==='loading'?<p role="status">{t.loading}</p>:null}
   {groups.length?groups.map((group,index)=><section key={group.id} aria-labelledby={`${id}-${index}`}>
    <h3 id={`${id}-${index}`} className="tw-t-head">{group.name}</h3>
    {groups.some(other=>other.id!==group.id&&other.name===group.name)?<p className="tw-meta">{group.skill_id}</p>:null}
    <div className="tw-list tw-list--choices">{group.actions.map(action=><button key={action.id} type="button" className="tw-item" data-action-id={action.id} disabled={status!=='ready'} onClick={()=>choose(action)}>
     <span className="tw-item__main"><span className="tw-item__name">{action.eligible<action.total?text(messages.fleetManagement.actionCount,{action:action.name,count:action.eligible}):action.name}</span><span className="tw-t-secondary">{action.description}</span></span>
     <PlaybookIcon name="chevron-down" className="tw-icon--next"/>
    </button>)}</div>
   </section>):status==='ready'?<EmptyState title={t.pickerEmpty}>{t.pickerEmptyHelp}</EmptyState>:null}
  </>}
 </div>;
}
