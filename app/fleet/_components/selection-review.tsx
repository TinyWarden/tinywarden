import {messages} from '@/i18n/messages';
import {text} from '@/components/operator/format';
import {DataTable} from '@/components/playbook/data';
import {RowStatus} from '@/components/playbook/controls';
import type {ServerRow} from './model';

const t=messages.fleetManagement;
export function actionReason(reason:string) {return (messages.maintenanceActions.errors as Record<string,string>)[reason]??t.errors[reason as keyof typeof t.errors]??t.otherFailure;}
type ReviewTarget=Pick<ServerRow,'host_id'|'label'>&Partial<Pick<ServerRow,'agent_version'|'update'>>;
export function SelectionReview({rows,eligible,skipped,update=false,identities=false,execution=false}:{rows:ReviewTarget[];eligible:ReviewTarget[];skipped:{subject:ReviewTarget;reason:string}[];update?:boolean;identities?:boolean;execution?:boolean}) {
  const reasons=new Map(skipped.map(item=>[item.subject.host_id,item.reason]));
  return <>
    <p>{text(execution?messages.skillActions.affected:t.affectedCount,{count:eligible.length,total:rows.length})}{skipped.length?' '+text(t.skippedCount,{count:skipped.length}):''}</p>
    <DataTable className="tw-table--edge-align tw-table--wrap-headings tw-table--stack tw-table--labelled" columns={[
      {key:'server',label:t.server},...(update?[{key:'current',label:t.updateCurrent},{key:'target',label:t.updateTarget}]:[]),{key:'state',label:t.actionOutcome}
    ]} rows={rows.map(row=>({server:<div><strong>{row.label}</strong>{identities?<p><code>{row.host_id}</code></p>:null}</div>,current:row.agent_version??t.versionUnknown,target:reasons.has(row.host_id)?'—':row.update?.version??'—',state:<div>
      <RowStatus status={reasons.has(row.host_id)?'unknown':'off'} value={reasons.has(row.host_id)?t.skipped:execution?messages.skillActions.willRun:update?t.updateReady:t.willChange}/>
      {reasons.has(row.host_id)?<p className="tw-t-secondary">{actionReason(reasons.get(row.host_id)!)}</p>:null}
    </div>}))}/>
  </>;
}
