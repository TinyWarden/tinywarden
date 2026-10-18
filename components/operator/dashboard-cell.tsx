import {messages} from "@/i18n/messages";
import type {DashboardCell as Cell,DashboardColumn} from "@/lib/skills/dashboard-types";
import {valueText} from "@/components/playbook/format";
import {UsageMeter} from "@/components/playbook/meter";
import {numericValue} from "@/lib/skills/display-values";
import {RowStatus} from "@/components/playbook/controls";
export function DashboardCell({column,cell,outdated=false}:{column:DashboardColumn;cell:Cell|undefined;outdated?:boolean}){
  const t=messages.dashboardCustomize,formatted=cell?.value!==null&&cell?.source?valueText(cell.value,cell.source,{}):null;
  const state=cell?.state??"unavailable",name=messages.dashboard.states[state as keyof typeof messages.dashboard.states]??t.unavailable;
  if(column.ref.kind==="skill_status"){
    if(!column.available||state==="unavailable")return <div className="tw-dashboard-cell"><span className="tw-t-secondary">{t.unavailable}</span></div>;
    const status=outdated&&state!=="disabled"?"unknown":state;
    return <div className="tw-dashboard-cell"><RowStatus status={status==="healthy"||status==="warning"||status==="critical"||status==="stale"||status==="disabled"||status==="not_configured"?status:"unknown"}/></div>;
  }
  return <div className="tw-dashboard-cell">{formatted===null?<span title={state==="healthy"||state==="warning"||state==="critical"?t.notReported:name}>{messages.display.missingValue}<span className="tw-meta">{state==="healthy"||state==="warning"||state==="critical"?t.notReported:name}</span></span>:<>
    {cell?.meter&&cell.source?<UsageMeter {...cell.meter} value={Number(numericValue(cell.value??undefined,cell.source))} label={column.label} formatted={formatted}/>:<span className="tw-mono">{formatted}</span>}
    {cell?.context?<span className="tw-meta">{cell.context}</span>:null}{state==="unknown"?<span className="tw-meta">{name}</span>:null}{cell?.truncated?<span className="tw-meta">{t.truncated}</span>:null}</>}</div>;
}
