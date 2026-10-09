"use client";
import {useEffect,useId,useRef,useState,type ReactNode} from "react";
import {messages} from "@/i18n/messages";
import {PlaybookButton,StatePill} from "./controls";
export {sampleTime,cadenceLabel} from "./format";
import type {DisplayStatus} from "@/lib/skills/display-types";
export function PlaybookIcon({name}:{name:"settings"|"table"|"check"|"book"}){
  const paths={settings:"M3 6h6m4 0h8M3 12h12m4 0h2M3 18h2m4 0h12M9 3v6m6 0v6M5 15v6",table:"M3 3h18v18H3zM3 9h18M9 3v18",check:"m5 12 4 4L19 6",book:"M12 6c-3-2-6-2-10-2v15c4 0 7 0 10 2 3-2 6-2 10-2V4c-4 0-7 0-10 2Zm0 0v15"};
  return <svg className="tw-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]}/></svg>;
}
export function Disclosure({title,meta,icon,plain=false,initialOpen=false,open:controlled,onOpen,children}:{title:ReactNode;meta?:ReactNode;icon?:ReactNode;plain?:boolean;initialOpen?:boolean;open?:boolean;onOpen?:(open:boolean)=>void;children:ReactNode}){
  const [local,setOpen]=useState(initialOpen),id=useId(),open=controlled??local;
  return <><button type="button" className={`tw-disclosure${plain?" tw-disclosure--plain":""}`} aria-expanded={open} aria-controls={id} onClick={()=>{setOpen(!open);onOpen?.(!open);}}>
    {plain?(icon??<PlaybookIcon name="table"/>):<span className="tw-disclosure__caret" aria-hidden="true">{open?messages.display.caretOpen:messages.display.caretClosed}</span>}
    <span className="tw-disclosure__title">{title}</span><span className="tw-disclosure__meta">{meta}</span>
    {plain?<span className="tw-disclosure__action">{open?messages.skills.hide:messages.skills.show}</span>:null}
  </button>{open?<div id={id} className="tw-disclosure__panel">{children}</div>:null}</>;
}
export function SkillFrame({id,title,status,summary,meta,onSettings,actions,children}:{id:string;title:string;status:DisplayStatus|"stale"|"disabled";summary:string;meta:ReactNode;onSettings:()=>void;actions?:ReactNode;children:ReactNode}){
  return <div className="tw-ui"><section className="tw-card tw-skill" id={id} tabIndex={-1} aria-labelledby={id+"-heading"}>
    <header className="tw-skill__head"><div className="tw-skill__intro"><div className="tw-skill__titlebar"><h2 className="tw-skill__title" id={id+"-heading"}>{title}</h2><StatePill status={status}/></div>
      <p className="tw-skill__summary">{summary}</p><p className="tw-meta">{meta}</p></div>
      <div className="tw-skill__actions">{actions??<div className="tw-skill__buttons"><SkillSettingsButton onClick={onSettings}/></div>}</div>
    </header>{children}</section></div>;
}
export function SkillSettingsButton({onClick}:{onClick:()=>void}){
  return <PlaybookButton type="button" variant="secondary" className="tw-btn--sm" aria-haspopup="dialog" onClick={onClick}><PlaybookIcon name="settings"/>{messages.server.settings}</PlaybookButton>;
}
export function SkillSlot({title,children,padded=true,flush=false}:{title?:string;children?:ReactNode;padded?:boolean;flush?:boolean}){
  return <div className={`tw-skill__slot${padded&&!flush?" tw-skill__slot--pad":""}`}>{title?(flush?<div className="tw-skill__slot--pad"><h3 className="tw-t-head">{title}</h3></div>:<h3 className="tw-t-head">{title}</h3>):null}{children}</div>;
}
export function SettingsDialog({title,meta,help,locked=false,close,children}:{title:string;meta:string;help:string;locked?:boolean;close:()=>void;children:ReactNode}){
  const dialog=useRef<HTMLDialogElement>(null),id=useId();
  useEffect(()=>{const el=dialog.current!;el.showModal();return()=>el.close();},[]);
  const request=()=>{if(!locked)close();};
  return <dialog ref={dialog} className="tw-dialog" aria-labelledby={id} onCancel={e=>{e.preventDefault();request();}} onClick={e=>{
    if(e.target!==e.currentTarget)return;const b=e.currentTarget.getBoundingClientRect();
    if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)request();
  }}><header className="tw-dialog__head"><div className="tw-dialog__titles"><span className="tw-meta">{meta}</span><h2 className="tw-dialog__title" id={id}>{title}</h2><p>{help}</p></div>
    <button type="button" className="tw-iconbtn" aria-label={messages.server.closeSettings} disabled={locked} onClick={request}>{messages.server.closeMark}</button></header>{children}</dialog>;
}
