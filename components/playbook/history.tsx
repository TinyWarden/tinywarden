"use client";
import {messages,locale} from "@/i18n/messages";
import type {HistoryWindow,CollectionReading} from "@/lib/skills/reading-types";
import {historyWindows} from "@/lib/skills/reading-types";
import {StatePill} from "./controls";
import {DataTable} from "./data";
import {sampleTime} from "./format";
import {TimePopover,type TimeBounds} from "./time-navigation";
export {Pagination as HistoryNavigation} from "./pagination";
export function HistoryRange({value,onChange,custom,onCustom,from,to}:{value:HistoryWindow;onChange:(value:HistoryWindow)=>void;custom?:TimeBounds|null;onCustom?:(range:TimeBounds|null)=>void;from?:string;to?:string}){
  const t=messages.display.navigation;
  return <div className="tw-timenav"><div className="tw-seg" role="group" aria-label={messages.display.window}>{(Object.keys(historyWindows) as HistoryWindow[]).map(window=><button type="button" className="tw-seg__opt" aria-pressed={!custom&&value===window} key={window} onClick={()=>onChange(window)}>{messages.display.windowLabels[window]}</button>)}
    {onCustom&&from&&to?<TimePopover active={!!custom} mode="range" from={from} to={to} apply={range=>onCustom(range as TimeBounds)}/>:null}</div>
    {custom&&onCustom?<button type="button" className="tw-active" aria-label={t.clearRange} onClick={()=>onCustom(null)}><span className="tw-active__key">{t.rangeLabel}</span><span className="tw-active__value">{sampleTime(custom.from,true)}{messages.dashboard.separator}{sampleTime(custom.to,true)}</span><span className="tw-active__x" aria-hidden="true">{messages.server.closeMark}</span></button>:null}
  </div>;
}
export function CollectionLog({rows,currentRow}:{rows:CollectionReading[];currentRow?:string|null}){
  const t=messages.display,stamp=(at:string)=>new Intl.DateTimeFormat(locale,{timeZone:messages.dashboard.timezone,month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(at));
  return <DataTable className="tw-table--history" rowIds={rows.map(r=>r.id)} currentRow={currentRow??null} columns={[{key:"time",label:t.time,className:"tw-history__time"},{key:"result",label:t.result,className:"tw-history__result"},{key:"note",label:t.note,className:"tw-history__note"}]} rows={rows.map(row=>({time:<time className="tw-cell-time" dateTime={row.at} title={sampleTime(row.at,true)}>{stamp(row.at)}</time>,result:<StatePill status={row.status}/>,note:<span className={row.note?"tw-cell-text":"tw-cell-empty"}>{row.note??t.missingValue}</span>}))}/>;
}
