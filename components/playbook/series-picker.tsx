"use client";
import {useEffect,useId,useRef,useState,type KeyboardEvent} from "react";
import {messages} from "@/i18n/messages";
import {PlaybookButton} from "./controls";
export interface SeriesChoice {key:string;label:string;formatted?:string}
export function SeriesPicker({choices,value,onChange,label=messages.display.series}:{choices:SeriesChoice[];value:string;onChange:(key:string)=>void;label?:string}){
  const id=useId(),button=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false),[query,setQuery]=useState(""),[placement,setPlacement]=useState({top:60,left:18}),t=messages.display;
  const selected=choices.find(choice=>choice.key===value),filtered=choices.filter(choice=>choice.label.toLowerCase().includes(query.toLowerCase()));
  function position(){const trigger=button.current,chart=trigger?.closest(".tw-chart");if(trigger&&chart){const anchor=trigger.getBoundingClientRect(),frame=chart.getBoundingClientRect(),width=Math.min(300,frame.width-36);setPlacement({top:anchor.bottom-frame.top+8,left:Math.max(18,Math.min(frame.width-width-18,anchor.right-frame.left-width))});}}
  function close(){setOpen(false);button.current?.focus();}
  function choose(key:string){onChange(key);close();}
  useEffect(()=>{
    if(!open)return;
    (popup.current?.querySelector<HTMLInputElement>('input')??popup.current?.querySelector<HTMLElement>('[aria-selected="true"]')??popup.current?.querySelector<HTMLElement>('[role="option"]'))?.focus();
    const outside=(event:PointerEvent)=>{const node=event.target as Node;if(!button.current?.contains(node)&&!popup.current?.contains(node))setOpen(false);};
    const escape=(event:globalThis.KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();setOpen(false);button.current?.focus();}};
    document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);
    const observer=new ResizeObserver(position);if(button.current)observer.observe(button.current);
    return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);observer.disconnect();};
  },[open]);
  function keys(event:KeyboardEvent<HTMLUListElement>){
    const items=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]')),index=items.indexOf(document.activeElement as HTMLElement);
    if(["ArrowDown","ArrowUp","Home","End"].includes(event.key)){
      event.preventDefault();const next=event.key==="Home"?0:event.key==="End"?items.length-1:event.key==="ArrowDown"?(index+1)%items.length:(index-1+items.length)%items.length;items[next]?.focus();
    }else if((event.key==="Enter"||event.key===" ")&&index>=0){event.preventDefault();choose(filtered[index]!.key);}
  }
  return <><PlaybookButton ref={button} type="button" variant="secondary" className="tw-btn--sm tw-chart__pickerbtn" disabled={!choices.length} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?id:undefined}
    onClick={()=>{if(!open){setQuery("");position();}setOpen(!open);}} onKeyDown={event=>{if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();setQuery("");position();setOpen(true);}}}>
    <span className="tw-chart__pickerlabel">{label}</span><span className="tw-chart__pickerval">{selected?.label??t.missingValue}</span><span className="tw-chart__pickercaret" aria-hidden="true">{messages.display.caretOpen}</span>
  </PlaybookButton>{open?<div ref={popup} className="tw-popover tw-chart__pickerpop" style={{...placement,right:"auto"}} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget)&&event.relatedTarget!==button.current)setOpen(false);}}>
    {choices.length>8?<input className="tw-input" type="search" aria-label={t.searchSeries} placeholder={t.searchSeries} value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==="ArrowDown"){event.preventDefault();popup.current?.querySelector<HTMLElement>('[role="option"]')?.focus();}}}/>:null}
    <ul id={id} className="tw-menu" role="listbox" aria-label={label} onKeyDown={keys}>{filtered.map(choice=><li key={choice.key} className="tw-menuitem" role="option" aria-selected={choice.key===value} tabIndex={choice.key===value?0:-1} onClick={()=>choose(choice.key)}>
      <span className="tw-menuitem__label tw-menuitem__label--mono" title={choice.label}>{choice.label}</span><span className="tw-menuitem__trail">{choice.formatted??t.missingValue}{choice.key===value?<span aria-hidden="true"> {t.checkMark}</span>:null}</span>
    </li>)}{!filtered.length?<li className="tw-menuitem tw-menuitem--empty" role="presentation">{t.noMatchingSeries}</li>:null}</ul>
  </div>:null}</>;
}
