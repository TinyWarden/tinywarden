"use client";
import {useId,useRef,useState} from "react";
import {ChartInspection} from "./chart-inspection";
import {messages,locale} from "@/i18n/messages";
import {namedValue} from "./format";
import {WidgetState} from "./controls";
import {sampleTime} from "./format";
import type {DisplayUnit} from "@/lib/skills/display-types";
import type {MetricGap} from "@/lib/skills/metric-types";
export interface ChartPoint {start:string;end:string;count:number;min:string|null;max:string|null;last:string|null;last_at:string|null;has_gap:boolean;incomplete:boolean;connect_from_previous:boolean}
export interface PlotPoint {at:string;last:string|null;min:string|null;max:string|null;count:number;connect_from_previous:boolean;has_gap:boolean}
export function ChartPlot({points,format,kind="line",label,unit,range,gaps=[]}:{points:PlotPoint[];format:(value:string)=>string;kind?:"line"|"bar"|"sparkline";label:string;unit?:DisplayUnit|undefined;range:{from:string;to:string};gaps?:MetricGap[]}){
  const [active,setActive]=useState<number|null>(null),help=useId(),focused=useRef(false),pinned=useRef(false);
  const usable=points.filter(p=>p.last!==null&&p.min!==null&&p.max!==null&&[p.last,p.min,p.max].every(v=>Number.isFinite(Number(v))));
  if(!usable.length)return <WidgetState state="empty"/>;
  const width=1000,height=100;
  const minimum=Math.min(...usable.map(p=>Number(p.min))),maximum=Math.max(...usable.map(p=>Number(p.max))),span=maximum-minimum||Math.max(1,Math.abs(maximum)*.05);
  const lower=unit==="count"?Math.min(0,Math.floor(minimum)):minimum-(maximum===minimum?span/2:0);
  const upper=unit==="count"?lower+2*Math.max(1,Math.ceil((Math.max(0,maximum)-lower)/2)):maximum+(maximum===minimum?span/2:0);
  const from=Date.parse(range.from),to=Date.parse(range.to),x=(at:string)=>Math.max(0,Math.min(1,(Date.parse(at)-from)/Math.max(1,to-from)))*width;
  const y=(v:string)=>(1-(Number(v)-lower)/(upper-lower))*height;
  const stamp=(v:string,short=false)=>new Intl.DateTimeFormat(locale,{timeZone:messages.dashboard.timezone,...(short?{}:{day:"numeric",month:"short"}),hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(v));
  const describe=(p:PlotPoint)=>[sampleTime(p.at,true),namedValue(messages.display.last,format(p.last!)),namedValue(messages.display.minimum,format(p.min!)),namedValue(messages.display.maximum,format(p.max!)),namedValue(messages.display.samples,p.count)].join(messages.dashboard.separator);
  const paths:string[]=[];let path="";
  points.forEach(p=>{if(p.last===null){if(path)paths.push(path);path="";return;}
    if(!p.connect_from_previous||p.has_gap){if(path)paths.push(path);path=`M ${x(p.at)} ${y(p.last)}`;}
    else path+=`${path?" L":"M"} ${x(p.at)} ${y(p.last)}`;
    if(p.has_gap){paths.push(path);path="";}});if(path)paths.push(path);
  return <div className="tw-chart__frame">
    <div className="tw-chart__y" aria-hidden="true">{kind!=="sparkline"?[0,.5,1].map(f=><span key={f} className="tw-chart__tick" style={{top:`${(1-f)*100}%`}}>{format(String(lower+f*(upper-lower)))}</span>):null}</div>
    <div className="tw-chart__area" role="group" tabIndex={0} aria-label={label} aria-describedby={help}
      onFocus={()=>{focused.current=true;setActive(usable.length-1);}} onBlur={()=>{focused.current=false;if(!pinned.current)setActive(null);}}
      onKeyDown={event=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;event.preventDefault();
        setActive(previous=>event.key==="Home"?0:event.key==="End"?usable.length-1:Math.max(0,Math.min(usable.length-1,(previous??usable.length-1)+(event.key==="ArrowLeft"?-1:1))));}}
      onPointerMove={event=>{if(event.pointerType!=="mouse"||pinned.current)return;const bounds=event.currentTarget.getBoundingClientRect(),at=from+(event.clientX-bounds.left)/bounds.width*(to-from);
        setActive(usable.reduce((best,p,i)=>Math.abs(Date.parse(p.at)-at)<Math.abs(Date.parse(usable[best]!.at)-at)?i:best,0));}}
      onPointerDown={event=>{if(event.pointerType!=="touch")return;pinned.current=true;const b=event.currentTarget.getBoundingClientRect(),at=from+(event.clientX-b.left)/b.width*(to-from);setActive(usable.reduce((best,p,i)=>Math.abs(Date.parse(p.at)-at)<Math.abs(Date.parse(usable[best]!.at)-at)?i:best,0));}}
      onPointerLeave={()=>{if(!pinned.current&&!focused.current)setActive(null);}}><span id={help} className="tw-sr">{messages.display.chartKeyboard}</span><svg className="tw-chart__plot" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label}>
    {kind!=="sparkline"?[0,.5,1].map(f=><line key={f} className="tw-chart__grid" x1="0" x2={width} y1={(1-f)*height} y2={(1-f)*height}/>):null}
    {gaps.map((gap,i)=><rect key={i} className="tw-chart__gap" x={x(gap.from)} y="0" width={Math.max(0,x(gap.to)-x(gap.from))} height={height}><title>{[messages.display.gapReasons[gap.reason],stamp(gap.from),stamp(gap.to)].join(messages.dashboard.separator)}</title></rect>)}
    {points.map((p,i)=>p.last!==null&&p.min!==null&&p.max!==null?<g key={i}><title>{describe(p)}</title>
      {kind==="bar"?<rect className="tw-chart__bar" x={x(p.at)-Math.max(1,width/Math.max(1,points.length)*.35)} y={Math.min(y(p.last),y(String(Math.max(lower,Math.min(upper,0)))))} width={Math.max(2,width/Math.max(1,points.length)*.7)} height={Math.max(1,Math.abs(y(p.last)-y(String(Math.max(lower,Math.min(upper,0))))))}/>:null}
      {p.min!==p.max?<line className={kind==="bar"?"tw-chart__whisker":"tw-chart__envelope"} x1={x(p.at)} x2={x(p.at)} y1={y(p.min)} y2={y(p.max)}/>:null}
    </g>:null)}
    {kind!=="bar"?paths.map((d,i)=><path key={i} className="tw-chart__series tw-chart__series--1" d={d}/>):null}
    </svg>
    {kind!=="bar"?points.map((p,i)=>p.last!==null&&p.min!==null&&p.max!==null&&(!p.connect_from_previous||i===0||points[i-1]?.last===null)&&(!points[i+1]?.connect_from_previous||p.has_gap)?<span key={i} className="tw-chart__point" role="img" aria-label={describe(p)} title={describe(p)} style={{left:`${x(p.at)/10}%`,top:`${y(p.last)}%`}}/>:null):null}
    {gaps.map((gap,i)=>x(gap.to)-x(gap.from)>260?<span key={i} className="tw-chart__gaplabel" title={messages.display.gapReasons[gap.reason]} style={{left:`${(x(gap.from)+x(gap.to))/20}%`,maxWidth:`${(x(gap.to)-x(gap.from))/10}%`}}>{messages.display.gapReasons[gap.reason].toUpperCase()}</span>:null)}
    {active!==null&&usable[active]?<ChartInspection point={usable[active]!} label={label} format={format} x={x(usable[active]!.at)/10} y={y(usable[active]!.last!)} close={()=>{pinned.current=false;setActive(null);}}/>:null}
    </div><div className="tw-chart__x" aria-hidden="true"><span className="tw-chart__tick tw-chart__tick--start" style={{left:0}}>{stamp(range.from)}</span>
      {kind!=="sparkline"?<span className="tw-chart__tick" style={{left:"50%"}}>{stamp(new Date((from+to)/2).toISOString(),true)}</span>:null}
      <span className="tw-chart__tick tw-chart__tick--end" style={{left:"100%"}}>{stamp(range.to)}</span></div>
  </div>;
}
export function ReadingChart({points,format,kind="line",label,unit}:{points:ChartPoint[];format:(value:string)=>string;kind?:"line"|"bar"|"sparkline";label:string;unit?:DisplayUnit|undefined}){
  if(!points.length)return <WidgetState state="empty"/>;
  return <><ChartPlot points={points.map(p=>({...p,at:p.last_at??p.start}))} format={format} kind={kind} label={label} unit={unit} range={{from:points[0]!.start,to:points.at(-1)!.end}}/>
    {points.some(p=>p.has_gap||!p.count)?<p className="tw-t-secondary">{messages.display.noConnection}</p>:null}
  </>;
}
