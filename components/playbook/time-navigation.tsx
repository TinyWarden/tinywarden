"use client";
import {useId,useRef,useState} from "react";
import {messages} from "@/i18n/messages";
import {text} from "@/components/operator/format";
import {PlaybookButton} from "./controls";
export interface TimeBounds {from:string;to:string}
const t=messages.display.navigation,zone=messages.dashboard.timezone;
export function localTime(value:string){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(value));
  const part=(name:string)=>parts.find(p=>p.type===name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
export function utcTime(value:string){
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value))return null;
  const wall=Date.parse(value+":00.000Z");if(!Number.isFinite(wall))return null;
  let instant=wall;
  for(let i=0;i<4;i++)instant+=wall-Date.parse(localTime(new Date(instant).toISOString())+":00.000Z");
  const result=new Date(instant).toISOString();return localTime(result)===value?result:null;
}
function zoneName(value:string){const at=utcTime(value);return at?new Intl.DateTimeFormat("en",{timeZone:zone,timeZoneName:"short"}).formatToParts(new Date(at)).find(p=>p.type==="timeZoneName")?.value:messages.display.missingValue;}
export function TimePopover({mode,from,to,apply,active=false}:{mode:"range"|"jump";from:string;to:string;apply:(value:TimeBounds|string)=>void;active?:boolean}){
  const id=useId(),popover=useRef<HTMLDivElement>(null),[start,setStart]=useState(localTime(from)),[end,setEnd]=useState(localTime(to)),[error,setError]=useState("");
  function submit(event:React.FormEvent){event.preventDefault();const first=utcTime(start),last=utcTime(end);
    if(!first||mode==="range"&&!last){setError(t.invalidTime);return;}
    if(mode==="range"){
      if(first>=last!||Date.parse(last!)-Date.parse(first)>90*86400000||Date.parse(last!)>Date.now()){setError(t.invalidRange);return;}
      if(Date.parse(first)<Date.now()-90*86400000){setError(t.expiredRange);return;}
      apply({from:first,to:last!});
    }else{
      if(first<from||first>=to){setError(t.invalidJump);return;}apply(first);
    }
    popover.current?.hidePopover();setError("");
  }
  return <><button type="button" className={mode==="range"?"tw-seg__opt":"tw-textbtn tw-textbtn--bare"} popoverTarget={id} aria-haspopup="dialog" aria-pressed={mode==="range"?active:undefined}
    onClick={()=>{const oldest=Math.ceil((Date.now()-90*86400000)/60000)*60000;setStart(localTime(mode==="range"?new Date(Math.max(Date.parse(from),oldest)).toISOString():from));setEnd(localTime(to));setError("");}}>{mode==="range"?t.custom:t.jump}</button>
    <div ref={popover} id={id} popover="auto" className="tw-popover" role="dialog" aria-label={mode==="range"?t.customRange:t.jumpTitle}>
      <form onSubmit={submit}><div className="tw-popover__body"><p className="tw-timenav__tz">{text(t.timezone,{zone})}</p>
        <div className="tw-field"><label className="tw-field__label" htmlFor={id+"-from"}>{mode==="range"?t.from:messages.display.time}</label><span className="tw-unit"><input id={id+"-from"} type="datetime-local" required value={start} onChange={e=>setStart(e.target.value)}/><span className="tw-unit__suffix">{zoneName(start)}</span></span></div>
        {mode==="range"?<div className="tw-field"><label className="tw-field__label" htmlFor={id+"-to"}>{t.to}</label><span className="tw-unit"><input id={id+"-to"} type="datetime-local" required value={end} onChange={e=>setEnd(e.target.value)}/><span className="tw-unit__suffix">{zoneName(end)}</span></span></div>:<p className="tw-t-secondary">{t.jumpHelp}</p>}
        {error?<p className="tw-notice tw-notice--danger" role="alert">{error}</p>:null}</div>
        <div className="tw-popover__foot"><PlaybookButton type="submit" className="tw-btn--sm">{mode==="range"?t.apply:t.jumpAction}</PlaybookButton><PlaybookButton variant="secondary" className="tw-btn--sm" onClick={()=>popover.current?.hidePopover()}>{t.cancel}</PlaybookButton></div>
      </form></div></>;
}
