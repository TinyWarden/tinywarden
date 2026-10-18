"use client";
import {messages} from "@/i18n/messages";
import type {ResourceChoice} from "./resource-selector";
const t=messages.resources;
export interface ResourceFilter {showAll:boolean;monitored:boolean;focus:{key:string;label:string}|null}
interface ResourceStateChoice {key:string;label:string;count:number}
export function resourceView(rows:ResourceChoice[],selected:string[],query:string,filter:ResourceFilter){
 const selection=new Set(selected),search=query.trim().toLocaleLowerCase();
 const eligible=rows.filter(row=>(filter.showAll||filter.monitored||row.selectable)&&(!filter.monitored||selection.has(row.key)));
 const scoped=eligible.filter(row=>!search||(row.label+' '+row.description+' '+row.key).toLocaleLowerCase().includes(search));
 const counts=new Map<string,number>();for(const row of scoped)counts.set(row.stateKey,(counts.get(row.stateKey)??0)+1);
 const choices=new Map<string,ResourceStateChoice>();for(const row of rows)if(!choices.has(row.stateKey))choices.set(row.stateKey,{key:row.stateKey,label:row.stateLabel,count:counts.get(row.stateKey)??0});
 if(filter.focus&&!choices.has(filter.focus.key))choices.set(filter.focus.key,{...filter.focus,count:0});
 const availableStates=new Set(eligible.map(row=>row.stateKey));
 const quick=[...choices.values()].filter(state=>availableStates.has(state.key)||filter.focus?.key===state.key).sort((a,b)=>a.label.localeCompare(b.label));
 const focus=filter.focus?.key??null;
 return {quick,focus,total:scoped.length,items:scoped.filter(row=>!focus||row.stateKey===focus)};
}
export function ResourceFilters({filter,change,quick,focus,total,selected}:{filter:ResourceFilter;change:(filter:ResourceFilter)=>void;quick:ResourceStateChoice[];focus:string|null;total:number;selected:number}){
 return <><div className="tw-resources__visibility">
  <label className="tw-check"><input type="checkbox" checked={filter.showAll} onChange={event=>change({...filter,showAll:event.target.checked})}/><span>{t.showAll}</span></label>
  <label className="tw-check"><input type="checkbox" checked={filter.monitored} onChange={event=>change({...filter,monitored:event.target.checked})}/><span>{t.monitoredOnly} <span className="tw-meta">{selected}</span></span></label>
 </div><div className="tw-seg tw-seg--scroll" role="group" aria-label={t.quickStates} onFocus={event=>event.target.scrollIntoView({block:'nearest',inline:'nearest'})}>
   <button type="button" className="tw-seg__opt" aria-pressed={focus===null} onClick={()=>change({...filter,focus:null})}>{t.allStates} <span className="tw-seg__count">{total}</span></button>
   {quick.map(state=><button type="button" key={state.key} className="tw-seg__opt" aria-pressed={focus===state.key} onClick={()=>change({...filter,focus:{key:state.key,label:state.label}})}>{state.label} <span className="tw-seg__count">{state.count}</span></button>)}
  </div>
 </>;
}
