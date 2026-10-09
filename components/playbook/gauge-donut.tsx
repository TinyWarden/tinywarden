import {messages} from "@/i18n/messages";
import {numberText,namedValue} from "./format";
import type {MeterProps} from "./meter";
import {WidgetState} from "./controls";
const palette=["var(--violet)","var(--ink)","var(--nav-label)","var(--success)","var(--warning)","var(--text-3)","var(--avatar)","var(--dashed)"];
export function Gauge({value,min,max,formatted,label,status="informational",thresholds=[]}:MeterProps) {
  if (min>=max || !Number.isFinite(min) || !Number.isFinite(max) || value!==null && !Number.isFinite(value))return <WidgetState/>;
  const fraction=value===null?0:Math.min(1,Math.max(0,(value-min)/(max-min)));
  return <div className="tw-gaugecard"><div className={`tw-gauge tw-gauge--${value===null?"nodata":status}`}>
    <svg viewBox="0 0 180 100" width="180" height="100" role="img" aria-label={namedValue(label,value===null?messages.display.missingValue:formatted)}>
      <path className="tw-gauge__track" d="M 12 90 A 78 78 0 0 1 168 90"/>
      {value!==null?<path className="tw-gauge__fill" d="M 12 90 A 78 78 0 0 1 168 90" pathLength="100" strokeDasharray={`${fraction*100} 100`}/>:null}
      {thresholds.map(t=>{const angle=Math.PI*(1-(t.value-min)/(max-min)),x=90+78*Math.cos(angle),y=90-78*Math.sin(angle);
        return <line key={t.severity} className={`tw-gauge__tick tw-gauge__tick--${t.severity}`} x1={x} y1={y} x2={90+88*Math.cos(angle)} y2={90-88*Math.sin(angle)}><title>{namedValue(messages.display.states[t.severity],t.value)}</title></line>;})}
    </svg><div className="tw-gauge__readout"><span className="tw-gauge__value">{value===null?messages.display.missingValue:formatted}</span></div>
  </div><span className="tw-t-secondary">{label}</span>{value!==null && (value<min || value>max)?<span>{messages.display.overflow}</span>:null}</div>;
}
export function Donut({parts,format,totalFormatted}:{parts:{label:string;value:number;formatted?:string}[];format:(n:number)=>string;totalFormatted?:string}) {
  const total=parts.reduce((sum,p)=>sum+p.value,0);
  if (!parts.length || total===0)return <WidgetState state="empty"/>;
  if (parts.length>8 || parts.some(p=>!Number.isFinite(p.value)||p.value<0) || !Number.isFinite(total))return <WidgetState/>;
  return <div className="tw-donut"><div className="tw-donut__ring"><svg viewBox="0 0 120 120" width="120" height="120" role="img" aria-label={namedValue(messages.display.total,totalFormatted??format(total))}>
    <circle className="tw-donut__track" cx="60" cy="60" r="48"/>
    {parts.map((p,i)=>{const start=parts.slice(0,i).reduce((sum,part)=>sum+part.value,0)/total*100,share=p.value/total*100;
      return <circle key={i} className="tw-donut__seg" cx="60" cy="60" r="48" pathLength="100" stroke={palette[i]} strokeDasharray={`${share} ${100-share}`} strokeDashoffset={-start}><title>{namedValue(p.label,p.formatted??format(p.value))}</title></circle>;})}
  </svg><div className="tw-donut__center"><span className="tw-donut__total">{totalFormatted??format(total)}</span><span className="tw-meta">{messages.display.total}</span></div></div>
    <ul className="tw-donut__legend">{parts.map((p,i)=><li key={i} className="tw-donut__row"><span className="tw-donut__sw" style={{background:palette[i]}}/><span>{p.label}</span><b>{p.formatted??format(p.value)}</b><span>{numberText(p.value/total*100,"percent",0)}</span></li>)}</ul></div>;
}
