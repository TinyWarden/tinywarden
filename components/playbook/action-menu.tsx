"use client";
import {useEffect,useId,useRef,useState,type ReactNode} from "react";
import {PlaybookIcon} from "./skill";
import {PlaybookButton} from "./controls";
/** Native top-layer menu, positioned synchronously before its first paint. */
export function ActionMenu({label,items,disabled=false,compact=false,icon}:{label:string;icon?:ReactNode;disabled?:boolean;compact?:boolean;items:{label:string;action:(trigger:HTMLButtonElement)=>void;disabled?:boolean;danger?:boolean;hint?:string|undefined;separatorBefore?:boolean;next?:boolean}[]}){
 const [opened,setOpened]=useState(false);
 const id=useId(),pop=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(!opened)return;const close=()=>pop.current?.hidePopover();window.addEventListener("resize",close);document.addEventListener("scroll",close,true);return()=>{window.removeEventListener("resize",close);document.removeEventListener("scroll",close,true);};},[opened]);
 function open(){const el=pop.current!,button=trigger.current!;if(el.matches(':popover-open')){el.hidePopover();return;}
  const b=button.getBoundingClientRect();el.style.left=Math.max(8,Math.min(b.right-240,window.innerWidth-248))+'px';el.style.top=Math.min(b.bottom+6,window.innerHeight-8)+'px';el.showPopover();
  const bounds=el.getBoundingClientRect();el.style.left=Math.max(8,Math.min(b.right-bounds.width,window.innerWidth-bounds.width-8))+'px';if(bounds.bottom>window.innerHeight-8)el.style.top=Math.max(8,b.top-bounds.height-6)+'px';
 }
 return <><PlaybookButton ref={trigger} type="button" variant="secondary" className="tw-btn--sm" disabled={disabled} aria-haspopup="menu" aria-label={label} title={label} aria-controls={id} popoverTarget={id} onClick={event=>{event.preventDefault();open();}} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();open();pop.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();}}}>{compact?<PlaybookIcon name="more-horizontal"/>:<>{label}{icon}</>}</PlaybookButton>
  <div id={id} ref={pop} popover="auto" onToggle={event=>setOpened(event.newState==="open")} className="tw-popover tw-actionmenu" onKeyDown={event=>{const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=buttons.indexOf(document.activeElement as HTMLButtonElement);if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}}}>
   <ul className="tw-menu" role="menu" aria-label={label}>{items.map((item,index)=><li key={index} role="none" className={item.separatorBefore&&index?'tw-menu__section':undefined}><button type="button" className={`tw-menuitem${item.danger?' tw-menuitem--danger':''}`} role="menuitem" disabled={item.disabled} onClick={()=>{pop.current?.hidePopover();trigger.current?.focus();item.action(trigger.current!);}}><span className="tw-item__main"><span className="tw-menuitem__label">{item.label}</span>{item.hint?<span className="tw-t-secondary">{item.hint}</span>:null}</span>{item.next?<PlaybookIcon name="chevron-down" className="tw-icon--next"/>:null}</button></li>)}</ul>
  </div></>;
}
