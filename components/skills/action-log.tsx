"use client";
import {useCallback,useId,useState,type ReactNode} from 'react';
import {messages} from '@/i18n/messages';
import {PlaybookIcon} from '@/components/playbook/skill';
import {PlaybookButton} from '@/components/playbook/controls';
import {CardPagination} from '@/components/playbook/pagination';
import {useOperatorRead,permissionEvent} from '@/components/operator/use-operator-read';
import {readOperatorPages} from '@/components/operator/package-pages';
import {text,time,operationLogTime,type Wire} from '@/components/operator/format';
import type {readActionLogs} from '@/server/maintenance/action-logs';
import type {ActionLogRow} from '@/lib/maintenance/action-log';

type LogRead=Wire<Awaited<ReturnType<typeof readActionLogs>>>;
const t=messages.operationLog;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function validActionLog(v:unknown):v is LogRead{
 return object(v)&&v.schema_version===1&&typeof v.as_of==='string'&&Number.isFinite(Date.parse(v.as_of))&&
  typeof v.operation_id==='string'&&typeof v.job_id==='string'&&typeof v.server==='string'&&typeof v.settled==='boolean'&&typeof v.detailed==='boolean'&&
  Number.isSafeInteger(v.page)&&Number(v.page)>0&&Number.isSafeInteger(v.total)&&Number(v.total)>=0&&Number(v.total)<=386&&v.page_size===25&&Array.isArray(v.rows)&&v.rows.length<=386&&
  v.rows.every(r=>object(r)&&typeof r.id==='string'&&typeof r.at==='string'&&Number.isFinite(Date.parse(r.at))&&
   ['info','warning','error'].includes(String(r.level))&&typeof r.phase==='string'&&(r.stage===null||typeof r.stage==='string')&&
   (r.code===null||typeof r.code==='string')&&(r.message===null||typeof r.message==='string'&&r.message.length<=4096));
}
export function actionLogText(row:ActionLogRow){
 if(row.message!==null)return row.message;
 if(row.stage)return (t.stages as Record<string,string>)[row.stage]??t.unknown;
 const phase=(t.phases as Record<string,string>)[row.phase]??row.phase;
 return text((t.codes as Record<string,string>)[row.code??'']??t.unknown,{phase});
}
const interval=(v:LogRead|null)=>v?.settled?Infinity:2000;

export function ActionLogView({rows,empty=false,latest}:{rows:ActionLogRow[];empty?:boolean;latest?:string|undefined}){
 return <>{empty?<p className="tw-t-secondary">{t.coarseOnly}</p>:null}
  <ol className="tw-action-log__entries" aria-label={t.entries}>{rows.map(r=><li key={r.id} data-level={r.level} data-latest={r.id===latest?true:undefined}>
   <time className="tw-meta" dateTime={r.at} title={time(r.at,true)}>{operationLogTime(r.at)}</time>
   <span>{r.level!=='info'?<span className="tw-meta">{t.levels[r.level]}{t.separator}</span>:null}{actionLogText(r)}</span>
  </li>)}</ol>
 </>;
}

/** Shared compact log composition; networking and action authority stay with its caller. */
export function OperationLogPanel({expanded,onExpanded,total,copy,live=false,children,pagination}: {
 expanded:boolean;onExpanded:(open:boolean)=>void;total?:number|undefined;copy?:ReactNode;live?:boolean;children:ReactNode;pagination?:ReactNode;
}){
 const id=useId();
 return <section className="tw-action-log" aria-label={t.title}>
  <header className="tw-action-log__head"><button className="tw-disclosure tw-disclosure--compact" type="button" aria-expanded={expanded} aria-controls={id} onClick={()=>onExpanded(!expanded)}>
   <PlaybookIcon name={expanded?'chevron-down':'chevron-right'}/><span className="tw-disclosure__title">{t.title}</span>{total!==undefined?<span className="tw-action-log__count">{total}</span>:null}
  </button>{expanded?copy:null}</header>
  <div id={id} hidden={!expanded}>
   <div className="tw-action-log__body">{children}</div>
   <div className="tw-action-log__foot"><span title={t.receivedTimes}>{t.receivedLabel}</span>{live?<span className="tw-action-log__live">{t.live}</span>:null}</div>
   {pagination}
  </div>
 </section>;
}

export function ActionOperationLog({operation,job,failed=false,open=true}:{operation:string;job:string;failed?:boolean;open?:boolean}){
 const [choice,setChoice]=useState<{failed:boolean;open:boolean}|null>(null),[paging,setPaging]=useState(false),[copying,setCopying]=useState(false),[notice,setNotice]=useState('');
 const expanded=choice?.failed===failed?choice.open:failed,path=`/api/v1/operator/fleet/maintenance/${operation}/jobs/${job}/logs`;
 const validate=useCallback((v:unknown):v is LogRead=>validActionLog(v)&&v.operation_id===operation&&v.job_id===job,[operation,job]);
 const read=useOperatorRead(path,validate,interval,open&&expanded),v=read.value;
 async function copy(){
  if(copying)return;setCopying(true);setNotice('');const controller=new AbortController(),timer=window.setTimeout(()=>controller.abort(),10000);
  try{
   const all=await readOperatorPages(path+'?copy=1',controller.signal,()=>document.dispatchEvent(new Event(permissionEvent)));
   if(!validate(all))throw new Error('action_log_invalid');
   await navigator.clipboard.writeText([all.server,text(t.operation,{id:operation}),text(t.job,{id:job}),
    ...all.rows.map(r=>`${r.at} ${t.levels[r.level]} ${actionLogText(r)}`)].join('\n'));
   setNotice(t.copied);
  }catch{setNotice(t.copyFailed);}finally{window.clearTimeout(timer);setCopying(false);}
 }
 const latest=v&&!v.settled&&!failed&&v.page===Math.ceil(v.total/25)?v.rows.at(-1)?.id:undefined;
 return <OperationLogPanel expanded={expanded} onExpanded={value=>setChoice({failed,open:value})} total={v?.total} live={!!v&&!v.settled&&!failed&&!read.failed&&!read.expired}
  copy={<PlaybookButton type="button" variant="secondary" className="tw-btn--sm tw-action-log__copy" aria-label={t.copy} disabled={copying||!v||read.failed||read.expired} onClick={()=>void copy()}><PlaybookIcon name={notice===t.copied?'check':'copy'}/><span className="tw-action-log__copy-label">{notice===t.copied?t.copiedShort:t.copyShort}</span><span className="sr-only" role="status">{notice===t.copied?notice:''}</span></PlaybookButton>}
  pagination={v&&v.total>25?<CardPagination page={v.page} total={v.total} count={v.rows.length} pageSize={25} loading={paging}
   itemLabel={t.ofEntries} onPage={page=>{setPaging(true);void read.reload(path+'?page='+page).finally(()=>setPaging(false));}}/>:null}>
  {read.failed?<p role="alert">{t.unavailable} <button className="tw-link" type="button" onClick={()=>void read.reload()}>{t.retry}</button></p>:null}
  {notice&&notice!==t.copied?<p role="status">{notice}</p>:null}
  {v?<ActionLogView rows={v.rows} empty={!v.detailed} latest={latest}/>:!read.failed?<p role="status">{t.loading}</p>:null}
 </OperationLogPanel>;
}
