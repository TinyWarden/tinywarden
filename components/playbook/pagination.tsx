"use client";
import {useId,useState} from "react";
import {messages} from "@/i18n/messages";
import {text} from "@/components/operator/format";
const t=messages.display.navigation;
export function pageNumbers(page:number,pages:number):(number|null)[]{
  const selected=new Set([1,pages,...Array.from({length:3},(_,i)=>page+i-1)].filter(n=>n>=1&&n<=pages));
  if(page<4)for(let n=1;n<=Math.min(5,pages);n++)selected.add(n);
  if(page>pages-3)for(let n=Math.max(1,pages-4);n<=pages;n++)selected.add(n);
  const result:(number|null)[]=[];for(const n of [...selected].sort((a,b)=>a-b)){const last=result.at(-1);if(typeof last==="number"&&n>last+1)result.push(null);result.push(n);}return result;
}
export function Pagination({page,total,count,loading,onPage}:{page:number;total:number;count:number;loading:boolean;onPage?:(page:number)=>void}){
  const pages=Math.max(1,Math.ceil(total/10)),id=useId(),[target,setTarget]=useState("");
  const button=(label:string,destination:number,disabled:boolean,icon:string)=><button type="button" className="tw-pager__btn" aria-label={label} title={label} disabled={disabled||loading||!onPage} onClick={()=>onPage?.(destination)}><svg className="tw-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={icon}/></svg></button>;
  return <nav className="tw-pager" aria-label={t.pages} aria-busy={loading}><div className="tw-pager__bar"><span className="tw-pager__range" role="status">
    {loading?<span className="tw-spinner" aria-label={messages.display.states.loading}/>:null}<b>{text(t.range,{from:count?(page-1)*10+1:0,to:count?(page-1)*10+count:0})}</b>{text(total===1?t.ofReading:t.ofReadings,{total})}</span>
    {pages>1?<><div className="tw-pager__nav">{button(t.first,1,page===1,"M5 5v14m13-14-7 7 7 7")}{button(t.previous,page-1,page===1,"m15 5-7 7 7 7")}
      <ol className="tw-pager__list">{pageNumbers(page,pages).map((n,i)=><li key={i}>{n===null?<span className="tw-pager__gap" aria-hidden="true">{t.ellipsis}</span>:<button type="button" className="tw-pager__btn" aria-label={text(t.page,{page:n})} aria-current={page===n?"page":undefined} disabled={loading||!onPage} onClick={()=>onPage?.(n)}>{n}</button>}</li>)}</ol>
      <span className="tw-pager__status">{text(t.pageStatus,{page,pages})}</span>{button(t.next,page+1,page===pages,"m9 5 7 7-7 7")}{button(t.last,pages,page===pages,"M19 5v14M6 5l7 7-7 7")}</div>
      {pages>7?<form className="tw-pager__jump" onSubmit={e=>{e.preventDefault();const n=Number(target);if(Number.isInteger(n)&&n>=1&&n<=pages){onPage?.(n);setTarget("");}}}>
        <label htmlFor={id} className="tw-pager__jumplabel">{t.goTo}</label><input id={id} type="number" className="tw-input" min="1" max={pages} step="1" value={target} required disabled={loading||!onPage} onChange={e=>setTarget(e.target.value)}/><span>{text(t.ofPages,{pages})}</span><button className="tw-btn tw-btn--secondary tw-btn--xs" type="submit" disabled={loading||!onPage}>{t.go}</button></form>:null}</>:null}
  </div></nav>;
}
