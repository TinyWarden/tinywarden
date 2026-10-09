"use client";
import type {ReactNode} from "react";
import {messages} from "@/i18n/messages";
import type {AdaptiveHistory,AdaptiveSeries} from "@/lib/skills/metric-types";
import {ChartPlot,type PlotPoint} from "./chart";
import {numberText} from "./format";
import {sampleTime} from "./skill";
import {text} from "@/components/operator/format";
export function ChartFrame({title,controls,picker,children}:{title:string;controls?:ReactNode;picker?:ReactNode;children:ReactNode}){
  return <figure className="tw-chart"><div className="tw-chart__head"><figcaption className="tw-chart__title">{title}</figcaption>{picker}{controls}</div>{children}</figure>;
}
export function MetricFigure({view,series,version,windowLabel,controls,kind="line",framed=true}:{view:AdaptiveHistory;series:AdaptiveSeries;version:string;windowLabel:string;controls?:ReactNode;kind?:"line"|"bar"|"sparkline";framed?:boolean}){
  const t=messages.display,format=(v:string)=>numberText(v,view.unit);
  const points:PlotPoint[]=view.representation==="samples"?(series.points??[]).map(p=>({at:p.at,last:p.value,min:p.value,max:p.value,count:p.value===null?0:1,connect_from_previous:p.connect_from_previous,has_gap:p.incomplete||p.reasons.includes("extraction")})):
    (series.buckets??[]).filter(b=>b.frame_count>0).map(b=>({at:b.last_at??b.start,last:b.last,min:b.min,max:b.max,count:b.count,connect_from_previous:b.connect_from_previous,has_gap:b.has_gap}));
  const content=<>
    <ChartPlot points={points} unit={view.unit} format={format} kind={kind} range={view.requested} gaps={series.gaps} label={view.title}/>
    {series.gaps.some(g=>g.coarse)?<p className="tw-t-secondary">{t.coarseGap}</p>:null}
    <p className="tw-meta">{series.summary.last_at?text(t.updatedShort,{time:sampleTime(series.summary.last_at)}):null}{messages.dashboard.separator}{text(t.versionRetention,{version})}{view.versions.length>1?messages.dashboard.separator+t.compatibleHistory:null}{series.first_available?messages.dashboard.separator+text(t.firstReading,{time:sampleTime(series.first_available,true)}):null}</p>
  </>;
  return framed?<ChartFrame title={text(t.chartTitle,{title:view.title,window:windowLabel})} controls={controls}>{content}</ChartFrame>:content;
}
