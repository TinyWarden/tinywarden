"use client";
import {useEffect,useId,useRef,useState,type ReactNode} from "react";
import {messages} from "@/i18n/messages";
import {PlaybookButton,StatePill} from "./controls";
export {sampleTime,cadenceLabel} from "./format";
import type {DisplayStatus} from "@/lib/skills/display-types";
export function PlaybookIcon({name,className=""}:{name:"more-horizontal"|"help"|"search"|"settings"|"table"|"check"|"book"|"refresh"|"repository"|"upload"|"link"|"plus"|"remove"|"user-round"|"chevron-down"|"key-round"|"log-out"|"gear";className?:string}){
  const paths={"more-horizontal":"M5 12h.01M12 12h.01M19 12h.01",help:"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01",search:"m21 21-4.3-4.3",link:"M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2",plus:"M12 4v16M4 12h16",remove:"M4 12h16",settings:"M3 6h6m4 0h8M3 12h12m4 0h2M3 18h2m4 0h12M9 3v6m6 0v6M5 15v6",table:"M3 3h18v18H3zM3 9h18M9 3v18",check:"m5 12 4 4L19 6",book:"M12 6c-3-2-6-2-10-2v15c4 0 7 0 10 2 3-2 6-2 10-2V4c-4 0-7 0-10 2Zm0 0v15",refresh:"M3 12a9 9 0 0 1 15.36-6.36L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.36 6.36L3 16M8 16H3v5",repository:"M3 7h6l2-3h10v17H3zM7 11h10M7 15h10",upload:"M12 16V3m-5 5 5-5 5 5M3 15v5a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-5"};
  const accountPaths={"user-round":"M20 21a8 8 0 0 0-16 0","chevron-down":"m6 9 6 6 6-6","key-round":"M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z","log-out":"m16 17 5-5-5-5M21 12H9M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4",gear:"M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"};
  return <svg className={`tw-icon ${className}`.trim()} aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{name==="help"?<circle cx="12" cy="12" r="10"/>:name==="search"?<circle cx="11" cy="11" r="8"/>:name==="user-round"?<circle cx="12" cy="8" r="5"/>:name==="key-round"?<circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>:name==="gear"?<circle cx="12" cy="12" r="3"/>:null}<path d={name in accountPaths?accountPaths[name as keyof typeof accountPaths]:paths[name as keyof typeof paths]}/></svg>;
}
export function Disclosure({title,meta,icon,plain=false,initialOpen=false,open:controlled,onOpen,children}:{title:ReactNode;meta?:ReactNode;icon?:ReactNode;plain?:boolean;initialOpen?:boolean;open?:boolean;onOpen?:(open:boolean)=>void;children:ReactNode}){
  const [local,setOpen]=useState(initialOpen),id=useId(),open=controlled??local;
  return <><button type="button" className={`tw-disclosure${plain?" tw-disclosure--plain":""}`} aria-expanded={open} aria-controls={id} onClick={()=>{setOpen(!open);onOpen?.(!open);}}>
    {plain?(icon??<PlaybookIcon name="table"/>):<span className="tw-disclosure__caret" aria-hidden="true">{open?messages.display.caretOpen:messages.display.caretClosed}</span>}
    <span className="tw-disclosure__title">{title}</span><span className="tw-disclosure__meta">{meta}</span>
    {plain?<span className="tw-disclosure__action">{open?messages.skills.hide:messages.skills.show}</span>:null}
  </button>{open?<div id={id} className="tw-disclosure__panel">{children}</div>:null}</>;
}
export function SkillFrame({id,title,status,summary,meta,onSettings,actions,children}:{id:string;title:string;status:DisplayStatus|"stale"|"disabled"|"not_configured";summary:string;meta:ReactNode;onSettings?:(()=>void)|undefined;actions?:ReactNode;children:ReactNode}){
  return <div className="tw-ui"><section className="tw-card tw-skill" id={id} tabIndex={-1} aria-labelledby={id+"-heading"}>
    <header className="tw-skill__head"><div className="tw-skill__intro"><div className="tw-skill__titlebar"><h2 className="tw-skill__title" id={id+"-heading"}>{title}</h2><StatePill status={status}/></div>
      <p className="tw-skill__summary">{summary}</p><p className="tw-meta">{meta}</p></div>
      <div className="tw-skill__actions">{actions??(onSettings?<div className="tw-skill__buttons"><SkillSettingsButton onClick={onSettings}/></div>:null)}</div>
    </header>{children}</section></div>;
}
export function SkillSettingsButton({onClick}:{onClick:()=>void}){
  return <PlaybookButton type="button" variant="secondary" className="tw-btn--sm" aria-haspopup="dialog" onClick={onClick}><PlaybookIcon name="settings"/>{messages.server.settings}</PlaybookButton>;
}
export function SkillSlot({title,children,padded=true,flush=false}:{title?:string;children?:ReactNode;padded?:boolean;flush?:boolean}){
  return <div className={`tw-skill__slot${padded&&!flush?" tw-skill__slot--pad":""}`}>{title?(flush?<div className="tw-skill__slot--pad"><h3 className="tw-t-head">{title}</h3></div>:<h3 className="tw-t-head">{title}</h3>):null}{children}</div>;
}
export function SettingsFooter({utilities,leading,children}:{utilities?:ReactNode;leading?:ReactNode;children:ReactNode}){
  return <footer className="tw-dialog__foot tw-dialog__foot--settings">{utilities?<div className="tw-dialog__utilities">{utilities}</div>:null}<div className="tw-dialog__actionbar">{leading}<div className="tw-dialog__actions">{children}</div></div></footer>;
}
export function SettingsDialog({title,meta,help,locked=false,close,children,step,size='default'}:{title:string;meta:string;help:string;locked?:boolean;close:()=>void;children:ReactNode;step?:string;size?:'default'|'wide'}){
  const dialog=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null),id=useId();
  useEffect(()=>{const el=dialog.current!;el.showModal();return()=>el.close();},[]);
  useEffect(()=>{if(step!==undefined)heading.current?.focus();},[step]);
  const request=()=>{if(!locked)close();};
  return <dialog ref={dialog} className={`tw-dialog${size==='wide'?' tw-dialog--wide':''}`} aria-labelledby={id} onCancel={e=>{e.preventDefault();request();}} onClick={e=>{
    if(e.target!==e.currentTarget)return;const b=e.currentTarget.getBoundingClientRect();
    if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)request();
  }}><header className="tw-dialog__head"><div className="tw-dialog__titles"><span className="tw-meta">{meta}</span><h2 ref={heading} tabIndex={step===undefined?undefined:-1} className="tw-dialog__title" id={id}>{title}</h2><p>{help}</p></div>
    <button type="button" className="tw-iconbtn" aria-label={messages.server.closeSettings} disabled={locked} onClick={request}>{messages.server.closeMark}</button></header>{children}</dialog>;
}
