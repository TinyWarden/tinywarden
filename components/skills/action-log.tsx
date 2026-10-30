"use client";
import {useCallback,useId,useState,type ReactNode} from 'react';
import {messages} from '@/i18n/messages';
import {PlaybookIcon} from '@/components/playbook/skill';
import {PlaybookButton} from '@/components/playbook/controls';
import {useOperatorRead,permissionEvent} from '@/components/operator/use-operator-read';
import {readOperatorPages} from '@/components/operator/package-pages';
import {text,operationLogTime,type Wire} from '@/components/operator/format';
import type {readActionLogs} from '@/server/maintenance/action-logs';
import {actionLogLimit,actionOutputStreams,type ActionLogRow} from '@/lib/maintenance/action-log';

type LogRead=Wire<Awaited<ReturnType<typeof readActionLogs>>>;
const t=messages.operationLog,maxRows=actionLogLimit+258;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function validActionLog(v:unknown):v is LogRead{
 return object(v)&&v.schema_version===1&&typeof v.as_of==='string'&&Number.isFinite(Date.parse(v.as_of))&&
  typeof v.operation_id==='string'&&typeof v.job_id==='string'&&typeof v.server==='string'&&typeof v.settled==='boolean'&&typeof v.detailed==='boolean'&&
  Number.isSafeInteger(v.page)&&Number(v.page)>0&&Number.isSafeInteger(v.total)&&Number(v.total)>=0&&Number(v.total)<=maxRows&&v.page_size===25&&Array.isArray(v.rows)&&v.rows.length<=maxRows&&
  v.rows.every(r=>object(r)&&typeof r.id==='string'&&typeof r.at==='string'&&Number.isFinite(Date.parse(r.at))&&
   ['info','warning','error'].includes(String(r.level))&&typeof r.phase==='string'&&(r.stage===null||typeof r.stage==='string')&&
   (r.code===null||typeof r.code==='string')&&(r.message===null||typeof r.message==='string'&&r.message.length<=4096)&&
   (r.output===undefined||r.output===null||object(r.output)&&actionOutputStreams.includes(r.output.stream as never)&&typeof r.output.text==='string'&&r.output.text.length<=1023));
}
export function actionLogText(row:ActionLogRow){
 if(row.output)return row.output.text;
 if(row.message!==null)return row.message;
 if(row.stage)return (t.stages as Record<string,string>)[row.stage]??t.unknown;
 const phase=(t.phases as Record<string,string>)[row.phase]??row.phase;
 return text((t.codes as Record<string,string>)[row.code??'']??t.unknown,{phase});
}
/** Native text stays literal. Historical status events are explicitly identified. */
export function actionTranscriptRows(rows:ActionLogRow[]){
 const captured=rows.some(r=>r.output);
 return rows.filter(r=>!captured||r.output||r.code==='log_truncated'||r.message!==null).map(r=>({id:r.id,
  stream:r.output?.stream??'status',text:r.output?.text??(r.code==='log_truncated'?`\n[${actionLogText(r)}]\n`:captured?`\n# ${actionLogText(r)}\n`:`${operationLogTime(r.at)} ${actionLogText(r)}\n`)}));
}
export function actionTranscriptText(rows:ActionLogRow[]){return actionTranscriptRows(rows).map(r=>r.text).join('');}
const interval=(v:LogRead|null)=>v?.settled?Infinity:2000;

export function ActionLogView({rows,empty=false,latest}:{rows:ActionLogRow[];empty?:boolean;latest?:string|undefined}){
 const captured=rows.some(r=>r.output);
 return <>{!captured?<p className="tw-action-log__historical">{empty?t.coarseOnly:t.historical}</p>:null}
  <pre className="tw-action-transcript" aria-label={t.transcript} data-latest={latest}>
   {actionTranscriptRows(rows).map(r=><span key={r.id} data-stream={r.stream}>{r.text}</span>)}
  </pre>
 </>;
}

/** Shared transcript frame; polling and execution authority stay with its caller. */
export function OperationLogPanel({expanded,onExpanded,total,copy,live=false,children,pagination,footnote}: {
 expanded:boolean;onExpanded:(open:boolean)=>void;total?:number|undefined;copy?:ReactNode;live?:boolean;children:ReactNode;pagination?:ReactNode;footnote?:ReactNode;
}){
 const id=useId();
 return <section className="tw-action-log" aria-label={t.title}>
  <header className="tw-action-log__head"><button className="tw-disclosure tw-disclosure--compact" type="button" aria-expanded={expanded} aria-controls={id} onClick={()=>onExpanded(!expanded)}>
   <PlaybookIcon name={expanded?'chevron-down':'chevron-right'}/><span className="tw-disclosure__title">{t.title}</span>{total!==undefined?<span className="tw-action-log__count">{total}</span>:null}
  </button>{expanded?copy:null}</header>
  <div id={id} hidden={!expanded}>
   <div className="tw-action-log__body">{children}</div>
   <div className="tw-action-log__foot"><span>{footnote??t.captured}</span>{live?<span className="tw-action-log__live">{t.live}</span>:null}</div>
   {pagination}
  </div>
 </section>;
}

export function ActionOperationLog({operation,job,failed=false,open=true}:{operation:string;job:string;failed?:boolean;open?:boolean}){
 const [expanded,setExpanded]=useState(false),[exporting,setExporting]=useState<'copy'|'download'|null>(null),[notice,setNotice]=useState('');
 const path=`/api/v1/operator/fleet/maintenance/${operation}/jobs/${job}/logs`;
 const validate=useCallback((v:unknown):v is LogRead=>validActionLog(v)&&v.operation_id===operation&&v.job_id===job,[operation,job]);
 const read=useOperatorRead(path+'?copy=1',validate,interval,open&&expanded),v=read.value;
 async function exportLog(kind:'copy'|'download'){
  if(exporting)return;setExporting(kind);setNotice('');const controller=new AbortController(),timer=window.setTimeout(()=>controller.abort(),10000);
  try{
   const all=await readOperatorPages(path+'?copy=1',controller.signal,()=>document.dispatchEvent(new Event(permissionEvent)));
   if(!validate(all))throw new Error('action_log_invalid');
   const content=[all.server,text(t.operation,{id:operation}),text(t.job,{id:job}),
    ...(all.rows.some(r=>r.output)?[]:[t.historical]),'',actionTranscriptText(all.rows)].join('\n');
   if(kind==='copy'){await navigator.clipboard.writeText(content);setNotice(t.copied);}
   else{const url=URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');
    link.href=url;link.download=`${job}.log`;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice(t.downloaded);}
  }catch(error){if(error instanceof Error&&['permission_lost','access_denied','obsolete_access','account_changed'].includes(error.message))read.clear();setNotice(kind==='copy'?t.copyFailed:t.downloadFailed);}finally{window.clearTimeout(timer);setExporting(null);}
 }
 const truncated=v?.rows.some(r=>r.code==='log_truncated'),hasOutput=v?.rows.some(r=>r.output);
 return <OperationLogPanel expanded={expanded} onExpanded={setExpanded} live={!!v&&!v.settled&&!failed&&!read.failed&&!read.expired}
  footnote={truncated?t.truncated:hasOutput?t.captured:t.receivedLabel}
  copy={<div className="tw-action-log__exports"><PlaybookButton type="button" variant="secondary" className="tw-btn--sm" aria-label={t.copy} disabled={!!exporting||!v||read.failed||read.expired} onClick={()=>void exportLog('copy')}><PlaybookIcon name={notice===t.copied?'check':'copy'}/><span className="tw-action-log__copy-label">{notice===t.copied?t.copiedShort:t.copyShort}</span></PlaybookButton>
   <PlaybookButton type="button" variant="secondary" className="tw-btn--sm" aria-label={t.download} disabled={!!exporting||!v||read.failed||read.expired} onClick={()=>void exportLog('download')}><PlaybookIcon name="download"/><span className="tw-action-log__copy-label">{t.downloadShort}</span></PlaybookButton></div>}>
  {read.failed?<p role="alert">{t.unavailable} <button className="tw-link" type="button" onClick={()=>void read.reload()}>{t.retry}</button></p>:null}
  {notice?<p className="tw-action-log__notice" role="status">{notice}</p>:null}
  {v?<ActionLogView rows={v.rows} empty={!v.detailed}/>:!read.failed?<p role="status">{t.loading}</p>:null}
 </OperationLogPanel>;
}
