'use client';
import {useState} from 'react';
import {messages} from '@/i18n/messages';

type Choice={value:string;title:string;description:string};
export function ChoiceCards({label,options,value,savedValue,disabled=false,onChange}:{label:string;options:readonly Choice[];value:string;savedValue?:string;disabled?:boolean;onChange:(value:string)=>void}){
 return <div className="tw-choices" role="radiogroup" aria-label={label}>{options.map((option,index)=><button key={option.value} type="button" className="tw-choice" role="radio" aria-checked={value===option.value} tabIndex={value===option.value?0:-1} disabled={disabled} onClick={()=>onChange(option.value)} onKeyDown={event=>{
  const direction=['ArrowRight','ArrowDown'].includes(event.key)?1:['ArrowLeft','ArrowUp'].includes(event.key)?-1:0;
  if(!direction&&event.key!=='Home'&&event.key!=='End')return;
  event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?options.length-1:(index+direction+options.length)%options.length;
  onChange(options[next]!.value);event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
 }}><span className="tw-choice__dot" aria-hidden="true"/><span className="tw-choice__body"><span className="tw-choice__head"><span className="tw-choice__title">{option.title}</span>{option.value===savedValue?<span className="tw-tag tw-tag--state">{messages.oidc.inUse}</span>:null}</span><span className="tw-choice__text">{option.description}</span></span></button>)}</div>;
}
export function ChoiceCardsExample({disabled=false}:{disabled?:boolean}){
 const [value,setValue]=useState('local'),t=messages.oidc;
 return <ChoiceCards label={t.method} options={[{value:'local',title:t.local,description:t.localHelp},{value:'oidc',title:t.oidc,description:t.oidcHelp}]} value={value} savedValue="local" disabled={disabled} onChange={setValue}/>;
}
