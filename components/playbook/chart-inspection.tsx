import {messages} from "@/i18n/messages";
import {namedValue} from "./format";
import {sampleTime} from "./format";
import type {PlotPoint} from "./chart";
export function ChartInspection({point,label,format,x,y,close}:{point:PlotPoint;label:string;format:(value:string)=>string;x:number;y:number;close:()=>void}){
  const t=messages.display,n=t.navigation,value=format(point.last!),stamp=sampleTime(point.at,true);
  return <><span className="tw-chart__cursor" style={{left:`${x}%`}}/>
    <span className="tw-chart__point tw-chart__point--active" style={{left:`${x}%`,top:`${y}%`}}/>
    <div className={`tw-chart__tip${x>50?" tw-chart__tip--left":""}`} style={{left:`${x}%`}} role="status"><span className="tw-chart__tiptime">{stamp}</span>
      <span className="tw-chart__tiprow"><span className="tw-chart__swatch"/><span className="tw-chart__tipname">{label}</span><span className="tw-chart__tipval">{value}</span></span>
      {point.count>1?<dl className="tw-chart__tipstats"><dt>{t.minimum}</dt><dd>{format(point.min!)}</dd><dt>{t.maximum}</dt><dd>{format(point.max!)}</dd><dt>{t.samples}</dt><dd>{point.count}</dd></dl>:null}</div>
    <div className="tw-chart__readout" role="status" aria-label={n.inspection}><time className="tw-chart__readout-time" dateTime={point.at}>{stamp}</time><span className="tw-chart__readout-name"><span className="tw-chart__swatch"/>{label}</span><span className="tw-chart__readout-val">{value}</span>
      {point.count>1?<span>{[namedValue(t.minimum,format(point.min!)),namedValue(t.maximum,format(point.max!)),namedValue(t.samples,point.count)].join(messages.dashboard.separator)}</span>:null}
      <button className="tw-iconbtn" type="button" aria-label={n.closeInspection} onClick={close}>{messages.server.closeMark}</button></div>
  </>;
}
