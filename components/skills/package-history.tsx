"use client";
import {useEffect,useState} from "react";
import {messages} from "@/i18n/messages";
import {text} from "@/components/operator/format";
import type {HistoryWindow,ReadingHistory} from "@/lib/skills/reading-types";
import {Disclosure,SkillSlot,sampleTime} from "@/components/playbook/skill";
import {CollectionLog,HistoryNavigation,HistoryRange} from "@/components/playbook/history";
import {TimePopover,type TimeBounds} from "@/components/playbook/time-navigation";
import {PlaybookButton,WidgetState} from "@/components/playbook/controls";
import {permissionEvent} from "@/components/operator/use-operator-read";
export function PackageHistory({host,installation,from,to,window,onWindow,custom,onCustom,open,onOpen,refresh,revision}:{
  host:string;installation:string;from:string;to:string;window:HistoryWindow;onWindow:(value:HistoryWindow)=>void;
  custom:TimeBounds|null;onCustom:(range:TimeBounds|null)=>void;open:boolean;onOpen:(open:boolean)=>void;refresh:()=>void;revision:number;
}){
  const scope=`${host}:${installation}:${from}:${to}`,navigationScope=`${scope}:${revision}`;
  const [navigation,setNavigation]=useState<{scope:string;page:number;asOf?:string;jump?:string}>({scope:navigationScope,page:1});
  const selected=navigation.scope===navigationScope?navigation:{scope:navigationScope,page:1};
  const query=new URLSearchParams({from,to,page:String(selected.page)});if(selected.asOf)query.set("as_of",selected.asOf);if(selected.jump)query.set("jump_at",selected.jump);
  const endpoint=`/api/v2/operator/hosts/${host}/skills/${installation}/readings?${query}`,key=`${navigationScope}:${query}`;
  const [result,setResult]=useState<{key:string;scope:string;view?:ReadingHistory;error?:string}|null>(null),[retry,setRetry]=useState(0);
  useEffect(()=>{if(!open)return;const controller=new AbortController();
    async function load(){try{
      const response=await fetch(endpoint,{signal:controller.signal,cache:"no-store",credentials:"same-origin"});
      if(response.status===401){setResult(null);document.dispatchEvent(new Event(permissionEvent));return;}
      const raw=await response.text();if(new TextEncoder().encode(raw).length>32*1024)throw new Error("range_too_large");
      const value=JSON.parse(raw);if(!response.ok)throw new Error(value.error?.code??value.error??"unavailable");
      if(value.format!==1||value.host!==host||value.installation!==installation||value.requested?.from!==from||value.requested?.to!==to||
        value.page_size!==10||!Number.isSafeInteger(value.total)||value.total<0||value.total>150000||!Number.isSafeInteger(value.page)||value.page<1||value.page>15000||
        !Number.isFinite(Date.parse(value.as_of))||!Array.isArray(value.readings)||value.readings.length>10||
        value.readings.some((r:ReadingHistory["readings"][number])=>typeof r.id!=="string"||!Number.isFinite(Date.parse(r.at))||!["healthy","warning","critical","unknown"].includes(r.status)||!(r.note===null||typeof r.note==="string"&&[...r.note].length<=241)))throw new Error("unavailable");
      if(!controller.signal.aborted)setResult({key,scope,view:value});
    }catch(error){if(!controller.signal.aborted)setResult(old=>({key,scope,...(old?.scope===scope&&old.view?{view:old.view}:{}),error:error instanceof Error?error.message:"unavailable"}));}}
    void load();return()=>controller.abort();
  },[open,endpoint,key,scope,host,installation,from,to,retry]);
  const current=result?.scope===scope?result:null,view=current?.view,loading=current?.key!==key,t=messages.display,n=t.navigation;
  const navigate=(page:number)=>setNavigation({scope:navigationScope,page,...(view?{asOf:view.as_of}:{})});
  return <SkillSlot padded={false}><Disclosure title={t.history} open={open} onOpen={onOpen}>
    <div className="tw-history" aria-busy={loading}><div className="tw-history__bar">
      <HistoryRange value={window} onChange={onWindow} custom={custom} onCustom={onCustom} from={from} to={to}/>
      <TimePopover mode="jump" from={from} to={to} apply={jump=>setNavigation({scope:navigationScope,page:selected.page,jump:jump as string,...(view?{asOf:view.as_of}:{})})}/>
      <div className="tw-history__fresh"><span className="tw-meta">{text(t.historyThrough,{time:sampleTime(to,true)})}</span><PlaybookButton variant="secondary" className="tw-btn--sm" onClick={refresh}>{messages.dashboard.refresh}</PlaybookButton></div></div>
      {view?<><CollectionLog rows={view.readings} currentRow={view.jumped_to}/>
        {selected.jump?<p className="tw-history__notice tw-t-secondary" role="status">{view.jumped_to?text(n.jumped,{time:sampleTime(selected.jump,true)}):n.noJump}</p>:null}
        <div className="tw-history__foot"><HistoryNavigation page={view.page} total={view.total} count={view.readings.length} loading={loading} onPage={navigate}/></div></>:!current?.error?<WidgetState state="loading"/>:null}
      {current?.error?<p role="status" className="tw-history__notice tw-t-secondary">{current.error==="range_too_large"?t.rangeTooLarge:view?n.refreshFailed:t.historyLoadFailed} <PlaybookButton variant="secondary" className="tw-btn--sm" onClick={()=>setRetry(n=>n+1)}>{t.retry}</PlaybookButton></p>:null}
    </div></Disclosure></SkillSlot>;
}
