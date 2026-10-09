"use client";
import {ReadingChart,type ChartPoint} from "@/components/playbook/chart";
import type {DisplayUnit} from "@/lib/skills/display-types";
import {numberText} from "@/components/playbook/format";
import {useState,type ReactNode} from "react";
import {messages} from "@/i18n/messages";
import {PlaybookButton} from "@/components/playbook/controls";
import {SeriesPicker} from "@/components/playbook/series-picker";
import {ChartFrame} from "@/components/playbook/metric-figure";
export function PlaybookExample({title,source,children}:{title:string;source:string;children:ReactNode}) {
  const [result,setResult]=useState<"copied"|"copyFailed"|null>(null),t=messages.display.playbook;
  async function copy(){try{await navigator.clipboard.writeText(source);setResult("copied");}catch{setResult("copyFailed");}}
  return <article className="tw-playbook-example"><header><h3>{title}</h3><PlaybookButton variant="secondary" onClick={()=>void copy()}>{t.copy}</PlaybookButton></header>
    <div className="tw-playbook-preview">{children}</div><details><summary>{t.source}</summary><pre tabIndex={0}><code>{source}</code></pre></details>
    {result?<p role="status">{t[result]}</p>:null}</article>;
}
export function InheritanceExample({id="playbook-interval"}:{id?:string}){
  const [custom,setCustom]=useState(false),[value,setValue]=useState("3600"),t=messages.display.playbook;
  return <div className="tw-field"><div className="tw-field__head"><label className="tw-field__label" htmlFor={id}>{t.demoInterval}</label>{custom?<span className="tw-tag">{messages.server.custom}</span>:null}</div>
    <p className="tw-field__note">{t.demoIntervalHelp}</p>
    <label className="tw-check"><input type="checkbox" checked={custom} onChange={e=>{setCustom(e.target.checked);if(!e.target.checked)setValue("3600");}}/>{messages.packageSkills.customValue}</label>
    <span className={`tw-unit ${custom?"tw-unit--custom":"tw-unit--inherited"}`}><input id={id} type="number" disabled={!custom} value={value} onChange={e=>setValue(e.target.value)}/><span className="tw-unit__suffix">{messages.server.seconds}</span></span>
    <span className={`tw-field__note${custom?" tw-field__note--custom":""}`}>{t.demoIntervalDefault}</span></div>;
}

export function PlaybookChart({points,kind,label,unit="percent"}:{points:ChartPoint[];kind:"line"|"bar"|"sparkline";label:string;unit?:DisplayUnit}){
  return <ReadingChart points={points} kind={kind} label={label} unit={unit} format={value=>numberText(value,unit,unit==="count"?0:1)}/>;
}

export function SeriesPickerExample(){
  const [value,setValue]=useState("/"),choices=[{key:"/",label:"/",reading:68},{key:"/home",label:"/home",reading:23},{key:"/mnt/backup",label:"/mnt/backup",reading:87},{key:"/var",label:"/var",reading:41}].map(choice=>({...choice,formatted:numberText(choice.reading,"percent",1)}));
  const points:ChartPoint[]=Array.from({length:12},(_,i)=>{const start=new Date(Date.UTC(2026,9,7,i)).toISOString(),end=new Date(Date.UTC(2026,9,7,i+1)).toISOString(),last=String(choices.find(choice=>choice.key===value)!.reading-7+i/2);return{start,end,count:1,min:last,max:last,last,last_at:start,incomplete:false,has_gap:false,connect_from_previous:i>0};});
  return <ChartFrame title={messages.display.playbook.seriesPicker} picker={<SeriesPicker choices={choices} value={value} onChange={setValue}/>}><PlaybookChart points={points} kind="line" label={messages.display.playbook.line}/></ChartFrame>;
}
