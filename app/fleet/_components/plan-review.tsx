"use client";
import {useState} from 'react';
import {messages} from '@/i18n/messages';
import {useOperatorRead} from '@/components/operator/use-operator-read';
import {DataTable,FactGrid} from '@/components/playbook/data';
import {RowStatus,StatePill} from '@/components/playbook/controls';
import {CardPagination} from '@/components/playbook/pagination';
import {time,text} from '@/components/operator/format';
import {validPlanReview} from './maintenance-model';
import {ActionValue} from '@/components/skills/action-value';

const t=messages.maintenanceActions;
const field=(key:string)=>(t.fields as Record<string,string>)[key]??t.fields.value;
export function reviewState(value:string){return <RowStatus status={value==='healthy'?'healthy':value==='warning'?'warning':value==='not_configured'?'not_configured':'off'} value={(t.states as Record<string,string>)[value]??t.unknown}/>;}
export function PlanReview({operation,id}:{operation:string;id:string}){
 const [table,setTable]=useState<string|null>(null),[page,setPage]=useState(1);
 const read=useOperatorRead(`/api/v1/operator/fleet/maintenance/${operation}/plans/${id}?${new URLSearchParams({...table?{table}:{},page:String(page)})}`,validPlanReview,30000),v=read.value;
 if(!v||read.failed)return <p role={read.failed?'alert':'status'}>{read.failed?t.unavailable:t.loading}</p>;
 const selected=v.tables.find(s=>s.id===v.table)!;
 return <>
  <div className="tw-fleet-summary"><strong>{v.label}</strong><StatePill status="informational" value={t.phases[v.phase]}/><span className="tw-meta">{t.expires+' '+time(v.expires_at,true)}</span></div>
  <FactGrid facts={v.facts.map(f=>({key:f.key,label:'label' in f&&typeof f.label==='string'?f.label:field(f.key),value:<ActionValue value={f.value} kind={f.kind}/>,mono:true}))}/>
  {'description' in v&&typeof v.description==='string'?<p>{v.description}</p>:null}
  <p>{t.disruption}</p>
  <div className="tw-seg tw-seg--scroll" role="group" aria-label={t.review}>{v.tables.map(s=><button type="button" key={s.id} className="tw-seg__opt" aria-pressed={s.id===v.table} disabled={read.busy} onClick={()=>{setTable(s.id);setPage(1);}}>{v.package_defined&&s.id!=='coverage'?s.label:(t as unknown as Record<string,string>)[s.label]??t.details} <span className="tw-seg__count">{s.count}</span></button>)}</div>
  <section className="tw-card"><DataTable className="tw-table--edge-align tw-table--wrap-headings tw-table--stack tw-table--labelled" columns={selected.columns.map(c=>({key:c.key,label:v.package_defined&&v.table!=='coverage'?c.label:field(c.label)}))} rows={v.rows.map(r=>Object.fromEntries(selected.columns.map((c,index)=>[c.key,v.table==='coverage'&&c.key==='state'?reviewState(String(r[c.key])):index===0?<strong><ActionValue value={r[c.key]} kind={c.kind}/></strong>:<ActionValue value={r[c.key]} kind={c.kind}/>])))}/>
   <CardPagination page={v.page} pageSize={v.page_size} total={v.total} count={v.rows.length} loading={read.busy} onPage={setPage} itemLabel={v.total===1?t.rowOne:t.rowsCount}/>
  </section>
  <p>{v.coverage.configured?t.coverageHelp:t.limitedCoverage}</p>
  {v.coverage.warnings?<p>{v.coverage.warnings===1?t.warningOne:text(t.warnings,{count:v.coverage.warnings})}</p>:null}
  {v.coverage.not_configured?<p>{v.coverage.not_configured===1?t.notConfiguredOne:text(t.notConfigured,{count:v.coverage.not_configured})}</p>:null}
 </>;
}
