"use client";
import {useId,useState,type ReactNode} from "react";
import {messages} from "@/i18n/messages";
import {text} from "@/components/operator/format";
import {DataTable} from "./data";
import {EmptyState,WidgetState} from "./controls";
import {InlineAlert} from "./forms";
import {FieldHelp} from "./field-help";
import {Pagination} from "./pagination";
import {ResourceFilters,resourceView,type ResourceFilter} from "./resource-filters";
const t=messages.resources;
export interface ResourceRow {key:string;identity?:string;label:string;description:string;state:ReactNode;selectable:boolean;selectionReason?:string|undefined;missing?:boolean}
export interface ResourceChoice extends ResourceRow {stateKey:string;stateLabel:string}
export function ResourceSelector({label,help,rows,selected,onChange,max=64,loading=false,available=true,fresh=true,complete=true,disabled=false,error,action}:{
 label:string;help:string;rows:ResourceChoice[];selected:string[];onChange:(value:string[])=>void;max?:number;loading?:boolean;available?:boolean;fresh?:boolean;complete?:boolean;disabled?:boolean;error?:string|undefined;action?:ReactNode;
}){
 const id=useId(),[query,setQuery]=useState(''),[filter,setFilter]=useState<ResourceFilter>({showAll:false,monitored:false,focus:null}),[page,setPage]=useState(1);
 const {items,...view}=resourceView(rows,selected,query,filter);
 function changeFilter(value:ResourceFilter){setFilter(value);setPage(1);}
 const current=Math.min(page,Math.max(1,Math.ceil(items.length/10))),visible=items.slice((current-1)*10,current*10);
 return <section className="tw-resources" aria-label={label} aria-busy={loading}>
  <div className="tw-resources__head"><div className="tw-field__head"><h3 className="tw-t-head">{label}</h3><FieldHelp id={id+'-help'} label={label} help={help}/></div><span className="tw-meta">{text(t.limit,{count:selected.length,max})}</span>{action}</div>
  {error?<InlineAlert title={error} tone="critical"/>:null}
  {available&&!fresh?<InlineAlert title={t.stale}>{t.staleHelp}</InlineAlert>:available&&!complete?<InlineAlert title={t.partial}>{t.partialHelp}</InlineAlert>:null}
  <div className="tw-resources__toolbar"><label className="tw-field"><input type="search" className="tw-input" aria-label={t.search} placeholder={t.search} value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/></label>
  </div><ResourceFilters filter={filter} change={changeFilter} {...view} selected={selected.length}/>

  {loading&&!available?<WidgetState state="loading"/>:!available?<EmptyState title={t.noInventory}>{t.noInventoryHelp}</EmptyState>:!items.length?<EmptyState title={filter.monitored&&!selected.length?t.none:t.noMatches}>{filter.monitored&&!selected.length?t.noneHelp:undefined}</EmptyState>:
   <ResourceTable rows={visible} selected={selected} monitor={r=>{
    const checked=selected.includes(r.key),blocked=disabled||!checked&&(!r.selectable||!fresh||!complete||selected.length>=max);
    const reason=r.selectionReason??(selected.length>=max?t.limitHelp:!fresh?t.staleHelp:!complete?t.partialHelp:undefined);
    return <label className="tw-check" title={blocked?reason:undefined}><input type="checkbox" aria-label={text(t.select,{name:r.label})} checked={checked} disabled={blocked} onChange={e=>onChange(e.target.checked?[...selected,r.key]:selected.filter(key=>key!==r.key))}/></label>;
   }}/>
  }
  <div className="tw-resources__pager"><Pagination page={current} total={items.length} count={visible.length} loading={loading} itemLabel={t.range} onPage={setPage}/></div>
 </section>;
}
export function ResourceTable({rows,monitor}:{rows:ResourceRow[];selected?:string[];monitor?:(row:ResourceRow)=>ReactNode}){
 return <DataTable className="tw-resource-table tw-table--stack tw-table--comfortable" columns={[{key:'resource',label:t.resource},{key:'state',label:t.state},...(monitor?[{key:'monitor',label:t.monitor}]:[])]} rowIds={rows.map(r=>r.key)} rows={rows.map(r=>({resource:<div className="tw-resource-table__identity"><strong>{r.label}</strong>{r.label!==(r.identity??r.key)?<span className="tw-meta">{r.identity??r.key}</span>:null}{r.description?<span className="tw-t-secondary">{r.description}</span>:null}{r.missing||r.selectionReason?<span className="tw-t-secondary">{r.missing?t.missing:r.selectionReason}</span>:null}</div>,state:r.state,monitor:monitor?.(r)}))}/>;
}
