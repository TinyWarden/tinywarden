import type {CSSProperties} from "react";
import {messages} from "@/i18n/messages";
import type {DisplayStatus} from "@/lib/skills/display-types";
import {namedValue} from "./format";
import {WidgetState} from "./controls";
export interface MeterProps {
  value:number|null;min:number;max:number;label:string;formatted:string;
  status?:DisplayStatus;thresholds?:{value:number;severity:"warning"|"critical"}[];
}
export function UsageMeter({value,min,max,label,formatted,status="informational",thresholds=[]}:MeterProps) {
  if (!(Number.isFinite(min)&&Number.isFinite(max)&&min<max) || value!==null && !Number.isFinite(value))return <WidgetState/>;
  const fraction=value===null?0:Math.min(1,Math.max(0,(value-min)/(max-min)));
  const missing=value===null,overflow=!missing && (value<min || value>max);
  return <div className={`tw-meter tw-meter--${missing?"nodata":status}`}>
    <div className="tw-meter__track" role={missing?undefined:"meter"} aria-label={label}
      aria-valuemin={min} aria-valuemax={max} aria-valuenow={missing?undefined:Math.min(max,Math.max(min,value))}
      aria-valuetext={missing?undefined:formatted}>
      {!missing?<span className="tw-meter__fill" style={{"--v":`${fraction*100}%`} as CSSProperties}/>:null}
      {thresholds.map(t=><span key={t.severity} className={`tw-meter__tick tw-meter__tick--${t.severity}`}
        title={namedValue(messages.display.states[t.severity],t.value)} style={{"--at":`${(t.value-min)/(max-min)*100}%`} as CSSProperties}/>)}</div>
    <span className="tw-meter__value" title={formatted}>{missing?messages.display.missingValue:formatted}{overflow?<span title={messages.display.overflow}>{messages.display.overflowMark}</span>:null}</span>
  </div>;
}
