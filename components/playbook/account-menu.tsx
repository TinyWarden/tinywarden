"use client";
import {useEffect,useId,useRef,useState,type ComponentProps} from "react";
import Link from "next/link";
import {messages} from "@/i18n/messages";
import {text} from "@/components/operator/format";
import {PlaybookIcon} from "./skill";

export type AccountMenuItem={href:string;label:string;icon:ComponentProps<typeof PlaybookIcon>["name"];current?:boolean};
export function AccountMenu({name,items,onSignOut,signingOut=false,initialOpen=false}:{name:string;items:readonly AccountMenuItem[];onSignOut:()=>void;signingOut?:boolean;initialOpen?:boolean}){
  const [open,setOpen]=useState(initialOpen),root=useRef<HTMLDetailsElement>(null),trigger=useRef<HTMLElement>(null),id=useId();
  useEffect(()=>{
    if(!open)return;
    const close=()=>{setOpen(false);trigger.current?.focus();};
    const outside=(event:MouseEvent)=>{if(event.target instanceof Node&&!root.current?.contains(event.target))close();};
    const keyboard=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();close();}};
    document.addEventListener("click",outside);document.addEventListener("keydown",keyboard);
    return()=>{document.removeEventListener("click",outside);document.removeEventListener("keydown",keyboard);};
  },[open]);
  function navigate(event:React.KeyboardEvent<HTMLDivElement>){
    if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;
    const choices=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'));
    if(!choices.length)return;
    event.preventDefault();const index=choices.indexOf(document.activeElement as HTMLElement);
    const next=event.key==="Home"?0:event.key==="End"?choices.length-1:event.key==="ArrowDown"?(index+1)%choices.length:(index-1+choices.length)%choices.length;
    choices[next]?.focus();
  }
  return <details ref={root} className="tw-ui tw-account" open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary ref={trigger} className="tw-account__btn" aria-label={text(messages.accountMenu.label,{name})} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onKeyDown={event=>{if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();setOpen(true);requestAnimationFrame(()=>{const choices=root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)');(event.key==="ArrowUp"?choices?.[choices.length-1]:choices?.[0])?.focus();});}}}>
      <PlaybookIcon name="user-round" className="tw-icon--18"/><span className="tw-account__name">{name}</span><PlaybookIcon name="chevron-down" className="tw-account__caret"/>
    </summary>
    <div id={id} className="tw-popover tw-account__pop" onKeyDown={navigate}>
      <ul className="tw-menu" role="menu" aria-label={messages.access.account}>{items.map(item=><li key={item.href} role="none"><Link href={item.href} className="tw-menuitem" role="menuitem" aria-current={item.current?"page":undefined} onClick={()=>setOpen(false)}><PlaybookIcon name={item.icon}/><span className="tw-menuitem__label">{item.label}</span></Link></li>)}</ul>
      <ul className="tw-menu tw-menu--foot" role="menu" aria-label={messages.accountMenu.session}><li role="none"><button type="button" className="tw-menuitem" role="menuitem" disabled={signingOut} onClick={onSignOut}><PlaybookIcon name="log-out"/><span className="tw-menuitem__label">{messages.fleet.logout}</span></button></li></ul>
    </div>
  </details>;
}
export function AccountMenuExample({open=false}:{open?:boolean}){
  return <div className="tw-account-example"><div className="tw-header"><AccountMenu name={messages.accountMenu.demoName} initialOpen={open} items={[
    {href:"/settings",label:messages.agentUpdates.settings,icon:"gear"},
    {href:"/account",label:messages.account.title,icon:"user-round",current:open},
    {href:"/account/password",label:messages.access.changePassword,icon:"key-round"}
  ]} onSignOut={()=>undefined}/></div></div>;
}
