import {messages} from "@/i18n/messages";
import type {DashboardCell as Cell,DashboardColumn} from "@/lib/skills/dashboard-types";
import {valueText} from "@/components/playbook/format";
import {UsageMeter} from "@/components/playbook/meter";
import {numericValue} from "@/lib/skills/display-values";
export function DashboardCell({column,cell}:{column:DashboardColumn;cell:Cell|undefined}){
  const t=messages.dashboardCustomize,formatted=cell?.value!==null&&cell?.source?valueText(cell.value,cell.source,{}):null;
  const state=cell?.state??"unavailable",name=messages.dashboard.states[state as keyof typeof messages.dashboard.states]??t.unavailable;
  return <div className="tw-dashboard-cell">{formatted===null?<span title={state==="healthy"||state==="warning"||state==="critical"?t.notReported:name}>{messages.display.missingValue}<span className="tw-meta">{state==="healthy"||state==="warning"||state==="critical"?t.notReported:name}</span></span>:<>
    {cell?.meter&&cell.source?<UsageMeter {...cell.meter} value={Number(numericValue(cell.value??undefined,cell.source))} label={column.label} formatted={formatted}/>:<span className="tw-mono">{formatted}</span>}
    {cell?.context?<span className="tw-meta">{cell.context}</span>:null}{state==="unknown"?<span className="tw-meta">{name}</span>:null}{cell?.truncated?<span className="tw-meta">{t.truncated}</span>:null}</>}</div>;
}
