import {actionValueText} from '@/components/skills/action-value';
import {messages} from '@/i18n/messages';
import {DataTable} from '@/components/playbook/data';
import {PlaybookButton} from '@/components/playbook/controls';
import {compactDashboardTime,time,text} from '@/components/operator/format';
import {Field} from './fields';
import {phaseLabel,type MaintenanceItem} from './maintenance-model';
const t=messages.maintenanceActions;
export function ApprovalReview({items,excluded,canary,change,confirmed,confirm,locked,review,asOf,policy}:{items:MaintenanceItem[];excluded:MaintenanceItem[];canary:string;change:(id:string)=>void;confirmed:boolean;confirm:(v:boolean)=>void;locked:boolean;review:(plan:string)=>void;asOf:string;policy:string}){
 return <>
  <Field label={t.canary}><select className="tw-input" value={canary} disabled={locked} onChange={e=>change(e.target.value)}>{items.map(i=><option key={i.job_id} value={i.job_id!}>{i.label}</option>)}</select></Field>
  <h3 className="tw-t-head">{t.order}</h3><DataTable className="tw-table--edge-align tw-table--wrap-headings tw-table--stack tw-table--labelled" columns={[{key:'server',label:t.server},{key:'changes',label:t.changes},{key:'coverage',label:t.coverage},{key:'review',label:t.review}]} rows={items.map((i,index)=>({server:<div><strong>{text(t.orderedServer,{position:index+1,name:i.label})}</strong>{i.plan_expires_at?<p className="tw-meta"><time dateTime={i.plan_expires_at} title={time(i.plan_expires_at,true)}>{text(t.planExpiryLabel,{expires:compactDashboardTime(Date.parse(i.plan_expires_at),asOf).label})}</time></p>:null}</div>,changes:<div>{i.review?.tables.map(table=><p key={table.id}>{text(t.factValue,{label:table.label??(t as unknown as Record<string,string>)[table.id]??t.details,value:actionValueText(table.count,'count')})}</p>)}{i.review?.facts.map(f=><p key={f.key}>{text(t.factValue,{label:f.label??(t.fields as Record<string,string>)[f.key]??t.fields.value,value:actionValueText(f.value,f.kind)})}</p>)}</div>,
   coverage:<div>{i.review?.coverage===1?t.coverageOne:text(t.coverageCount,{count:i.review?.coverage??0})}{i.review?.warnings?<p>{i.review.warnings===1?t.warningOne:text(t.warnings,{count:i.review.warnings})}</p>:null}{i.review?.not_configured?<p>{i.review.not_configured===1?t.notConfiguredOne:text(t.notConfigured,{count:i.review.not_configured})}</p>:null}</div>,review:<PlaybookButton type="button" variant="secondary" className="tw-btn--sm" disabled={locked||!i.plan_id} onClick={()=>review(i.plan_id!)}>{t.review}</PlaybookButton>}))}/>
  {items.some(i=>i.review?.coverage===0)?<p>{t.limitedFleetCoverage}</p>:null}
  {excluded.length?<><h3 className="tw-t-head">{t.excluded}</h3><DataTable className="tw-table--edge-align tw-table--stack tw-table--labelled" columns={[{key:'server',label:t.server},{key:'state',label:t.status}]} rows={excluded.map(i=>({server:i.label,state:phaseLabel(i)}))}/></>:null}
  <p>{policy}</p><p>{t.disruption}</p><label className="tw-check"><input type="checkbox" checked={confirmed} disabled={locked} onChange={e=>confirm(e.target.checked)}/>{t.approvalConfirm}</label>
 </>;
}
export function CancellationReview({items}:{items:MaintenanceItem[]}){return <><p>{t.cancelConfirm}</p><DataTable className="tw-table--edge-align tw-table--wrap-headings tw-table--stack tw-table--labelled" columns={[{key:'server',label:t.server},{key:'state',label:t.status}]} rows={items.map(i=>({server:<strong>{i.label}</strong>,state:phaseLabel(i)}))}/></>;}
