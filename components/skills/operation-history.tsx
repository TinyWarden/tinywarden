"use client";
import {useCallback,useState} from 'react';
import {messages} from '@/i18n/messages';
import {useOperatorRead} from '@/components/operator/use-operator-read';
import {SettingsDialog,PlaybookIcon} from '@/components/playbook/skill';
import {PlaybookButton,EmptyState} from '@/components/playbook/controls';
import {ActionActivity} from '@/components/playbook/action-activity';
import {CursorPagination} from '@/components/playbook/pagination';
import {operationActivityState,validOperationSummary,type SkillOperationSummary} from '@/lib/maintenance/operation-summary';

type History={schema_version:1;as_of:string;total:number;next_cursor:string|null;
 operations:{id:string;kind:string;job:SkillOperationSummary}[]};
const valid=(v:unknown):v is History=>{
 const r=v as History;return !!r&&r.schema_version===1&&typeof r.as_of==='string'&&Number.isSafeInteger(r.total)&&r.total>=0&&
  (r.next_cursor===null||typeof r.next_cursor==='string')&&Array.isArray(r.operations)&&r.operations.length<=25&&
  r.operations.every(o=>o.kind==='maintenance_action'&&validOperationSummary(o.job)&&o.id===o.job.operation_id);
};
export function OperationHistory({host,installation,skillName,server,open,close,show}:{host:string;installation:string;skillName:string;server:string;open:boolean;close:()=>void;show:(job:SkillOperationSummary,trigger:HTMLButtonElement)=>void}){
 const [cursors,setCursors]=useState<(string|null)[]>([null]),[pagingFrom,setPagingFrom]=useState<History|null>(null),t=messages.skillActions;
 const query=new URLSearchParams({host,installation});if(cursors.at(-1))query.set('cursor',cursors.at(-1)!);
 const validate=useCallback((v:unknown):v is History=>valid(v)&&v.operations.every(o=>o.job.host_id===host&&o.job.installation_id===installation),[host,installation]);
 const read=useOperatorRead('/api/v1/operator/fleet-operations?'+query,validate,10000,open);
 const value=read.value;
 return <SettingsDialog title={t.recentResults} meta={skillName} help={<span className="tw-action-progress__server"><PlaybookIcon name="server"/>{server}</span>} close={close} open={open} step="history" className="tw-dialog--action-history">
  <div className="tw-dialog__body"><p className="tw-t-secondary">{t.resultsHelp}</p>
   {read.failed?<p role="alert">{t.unavailable}</p>:null}
   {!value?<p role="status">{messages.dashboard.loading}</p>:value.operations.length?<ul className="tw-action-history">{value.operations.map(({job})=><li key={job.job_id} className="tw-action-history__item"><ActionActivity receipt name={job.progress.name??t.title} state={operationActivityState(job)} at={job.completed_at??job.created_at} onProgress={event=>show(job,event.currentTarget)}/></li>)}</ul>:<EmptyState title={t.noResults}/>}
   {value?<CursorPagination page={cursors.length} total={value.total} count={value.operations.length} loading={read.busy&&pagingFrom===value} hasNext={!!value.next_cursor} onPrevious={()=>{setPagingFrom(value);setCursors(old=>old.slice(0,-1));}} onNext={()=>{if(value.next_cursor){setPagingFrom(value);setCursors(old=>[...old,value.next_cursor]);}}} itemLabel={t.resultCount}/>:null}
  </div><footer className="tw-dialog__foot"><PlaybookButton variant="secondary" type="button" onClick={close}><PlaybookIcon name="close"/>{messages.fleetManagement.close}</PlaybookButton></footer>
 </SettingsDialog>;
}
