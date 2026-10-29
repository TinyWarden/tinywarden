"use client";
import {useCallback,useState} from 'react';
import {messages} from '@/i18n/messages';
import {Disclosure,PlaybookIcon} from '@/components/playbook/skill';
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

export function ActionLogView({rows,empty=false}:{rows:ActionLogRow[];empty?:boolean}){
 return <>{empty?<p className="tw-t-secondary">{t.coarseOnly}</p>:null}
  <ol className="tw-action-log__entries" aria-label={t.entries}>{rows.map(r=><li key={r.id} data-level={r.level}>
   <time className="tw-meta" dateTime={r.at} title={time(r.at,true)}>{operationLogTime(r.at)}</time>
   <span>{r.level!=='info'?<span className="tw-meta">{t.levels[r.level]}{t.separator}</span>:null}{actionLogText(r)}</span>
  </li>)}</ol>
 </>;
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
 return <div className="tw-action-log"><Disclosure plain title={t.title} open={expanded} onOpen={value=>setChoice({failed,open:value})} icon={<PlaybookIcon name="book"/>}>
  <div className="tw-action-log__tools"><p className="tw-t-secondary">{t.receivedTimes}</p><PlaybookButton type="button" variant="secondary" className="tw-btn--sm" disabled={copying||!v||read.failed||read.expired} onClick={()=>void copy()}>{t.copy}</PlaybookButton></div>
  {read.failed?<p role="alert">{t.unavailable} <button className="tw-link" type="button" onClick={()=>void read.reload()}>{t.retry}</button></p>:null}
  {notice?<p role="status">{notice}</p>:null}
  {v?<><ActionLogView rows={v.rows} empty={!v.detailed}/><CardPagination page={v.page} total={v.total} count={v.rows.length} pageSize={25} loading={paging}
   itemLabel={t.ofEntries} onPage={page=>{setPaging(true);void read.reload(path+'?page='+page).finally(()=>setPaging(false));}}/></>:!read.failed?<p role="status">{t.loading}</p>:null}
 </Disclosure></div>;
}
