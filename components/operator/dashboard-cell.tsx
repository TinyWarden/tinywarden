import {messages} from "@/i18n/messages";
import type {DashboardCell as Cell,DashboardColumn} from "@/lib/skills/dashboard-types";
import {valueText} from "@/components/playbook/format";
import {RowStatus,toRowStatus,ContextValue} from "@/components/playbook/controls";
import {numericValue} from "@/lib/skills/display-values";
import {compactDashboardTime} from "./format";
export function DashboardCell({column,cell,asOf,outdated=false}:{column:DashboardColumn;cell:Cell|undefined;asOf:string;outdated?:boolean}){
  const t=messages.dashboardCustomize,formatted=cell?.value!==null&&cell?.source?valueText(cell.value,cell.source,{}):null;
  const state=cell?.state??"unavailable",name=messages.dashboard.states[state as keyof typeof messages.dashboard.states]??t.unavailable;
  if(column.ref.kind==="skill_status"){
    if(!column.available||state==="unavailable")return <div className="tw-dashboard-cell"><span className="tw-t-secondary">{t.unavailable}</span></div>;
    const status=outdated&&state!=="disabled"?"unknown":state;
    return <div className="tw-dashboard-cell"><RowStatus status={status==="healthy"||status==="warning"||status==="critical"||status==="stale"||status==="disabled"||status==="not_configured"?status:"unknown"}/></div>;
  }
  const stamp=formatted!==null&&cell?.source?.kind==="time"&&typeof cell.value==="number"?compactDashboardTime(cell.value,asOf):null;
  const numeric=!!cell?.source&&numericValue(cell.value??undefined,cell.source)!==null,numericContext=numeric?cell?.context:null;
  return <div className="tw-dashboard-cell">{formatted===null?<span title={state==="healthy"||state==="warning"||state==="critical"?t.notReported:name}>{messages.display.missingValue}<span className="tw-meta">{state==="healthy"||state==="warning"||state==="critical"?t.notReported:name}</span></span>:<>
    {numericContext?<ContextValue value={formatted} context={numericContext}/>:<span className={`tw-mono tw-dashboard-value${numeric?" tw-cell-num":""}`}>{cell?.context?<span>{cell.context}</span>:null}{stamp?<time className="tw-dashboard-time" dateTime={stamp.dateTime} title={stamp.full} aria-label={stamp.full}>{stamp.label}</time>:cell?.source?.kind==="boolean"?<RowStatus status={toRowStatus(outdated&&state!=="disabled"?"unknown":state)} value={formatted}/>:<span>{formatted}</span>}</span>}
    {state==="unknown"?<span className="tw-meta">{name}</span>:null}{cell?.truncated?<span className="tw-meta">{t.truncated}</span>:null}</>}</div>;
}
