"use client";
import {useState} from "react";
import {messages} from "@/i18n/messages";
import {text} from "@/components/operator/format";
import {Pagination} from "./pagination";
import {CollectionLog,HistoryRange} from "./history";
import {TimePopover,type TimeBounds} from "./time-navigation";
import {historyWindows,type HistoryWindow} from "@/lib/skills/reading-types";
const end="2026-10-09T09:00:00.000Z",t=messages.display.navigation;
export function NavigationExample(){
  const [page,setPage]=useState(55),[window,setWindow]=useState<HistoryWindow>("90d"),[custom,setCustom]=useState<TimeBounds|null>(null),[jump,setJump]=useState<number|null>(null);
  const from=custom?.from??new Date(Date.parse(end)-historyWindows[window]).toISOString(),to=custom?.to??end;
  const readings=Array.from({length:10},(_,i)=>{const at=new Date(Date.parse(to)-((page-1)*10+i+1)*300000).toISOString();return {id:String(i),at,finished_at:at,received_at:at,outcome:"observed",status:i===3?"warning" as const:"healthy" as const,note:i===3?messages.display.playbook.demoSummary:null,current:true,version:"1.0.0"};});
  return <div className="tw-card tw-history__card"><div className="tw-history"><div className="tw-history__bar"><HistoryRange value={window} onChange={value=>{setWindow(value);setCustom(null);setPage(1);setJump(null);}} custom={custom} onCustom={value=>{setCustom(value);setPage(1);setJump(null);}} from={from} to={to}/>
    <TimePopover mode="jump" from={from} to={to} apply={value=>{const rank=Math.max(0,Math.min(1079,Math.round((Date.parse(to)-Date.parse(value as string))/300000)-1));setPage(Math.floor(rank/10)+1);setJump(rank%10);}}/>
    <span className="tw-timenav__tz">{text(t.timezone,{zone:messages.dashboard.timezone})}</span></div>
    <CollectionLog rows={readings} currentRow={jump===null?null:String(jump)}/><div className="tw-history__foot"><Pagination page={page} total={1080} count={10} loading={false} onPage={value=>{setPage(value);setJump(null);}}/></div></div></div>;
}
