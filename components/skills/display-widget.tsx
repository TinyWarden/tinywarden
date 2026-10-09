import type {TimeBounds} from "@/components/playbook/time-navigation";
import type {ReactNode} from "react";
import {messages} from "@/i18n/messages";
import {packageText,type PackageMetadata,type PackageAssessment,type SkillSettings} from "@/lib/skills/package-types";
import type {HistoryWindow} from "@/lib/skills/reading-types";
import type {DisplayWidget,SkillDisplay} from "@/lib/skills/display-types";
import {boundValue,numericBinding,meterModel} from "@/lib/skills/display-bindings";
import {unitOf,enumLabel,compareDisplayLabels} from "@/lib/skills/display-values";
import {valueText,numberText} from "@/components/playbook/format";
import {UsageMeter} from "@/components/playbook/meter";
import {Gauge,Donut} from "@/components/playbook/gauge-donut";
import {FactGrid,DataTable,BarChart} from "@/components/playbook/data";
import {WidgetState} from "@/components/playbook/controls";
import {MetricChart} from "./metric-chart";
export interface DisplayContext {
  metadata:PackageMetadata;display:SkillDisplay;assessment:PackageAssessment;settings:SkillSettings;
  host:string;installation:string;digest:string;asOf:string;window:HistoryWindow;onWindow:(value:HistoryWindow)=>void;custom:TimeBounds|null;onCustom:(range:TimeBounds|null)=>void;rangeControls?:boolean;
}
export function DisplayWidgetView({widget,context}:{widget:DisplayWidget;context:DisplayContext}):ReactNode {
  const {metadata,display,assessment,settings}=context,facts=assessment.facts;
  const label=(key:string)=>packageText(metadata.catalog,{key,params:{}});
  if(widget.type==="facts")return <FactGrid facts={widget.facts.map(key=>{
    const bound=boundValue(display,facts,{fact:key}),formatted=bound?valueText(bound.value,bound.source,metadata.catalog):null;
    return {key,label:bound?label(bound.label):key,value:formatted??messages.display.missingValue,missing:formatted===null,mono:!!bound&&["number","percent","duration"].includes(bound.source.kind)||!!bound?.source.encoding,muted:!!bound&&typeof bound.value==="string"&&!!bound.source.muted_values?.includes(bound.value)};})}/>;
  if(widget.type==="meter"||widget.type==="gauge"){
    const bound=numericBinding(display,facts,widget.value),model=meterModel(widget,display,facts,settings,assessment);
    if(!model)return <WidgetState/>;
    const props={...model,value:bound?.number??null,formatted:bound?valueText(bound.value,bound.source,metadata.catalog)??messages.display.missingValue:messages.display.missingValue,label:label(widget.title_key)};
    return widget.type==="gauge"?<Gauge {...props}/>:<UsageMeter {...props}/>;
  }
  if(widget.type==="line_chart"||widget.type==="sparkline"||widget.type==="bar_chart"&&widget.mode==="history"){
    const metric=display.metrics?.[widget.metric],fact=facts.find(f=>f.key===metric?.value.fact);
    const source=metric?display.sources[metric.value.fact]:undefined;
    const keyColumn=metric?.series_key,labelColumn=metric?.series_label;
    const seriesTable=display.sections.flatMap(section=>section.widgets).find(item=>item.type==="table"&&item.source===metric?.value.fact);
    const currentSeries=keyColumn&&labelColumn?fact?.kind==="table"&&source?.kind==="table"?fact.rows.flatMap(row=>{
      const key=row[keyColumn],text=row[labelColumn],labelSource=source.columns[labelColumn],bound=boundValue(display,facts,metric!.value,row);
      return typeof key==="string"&&typeof text==="string"&&labelSource?[{key,label:enumLabel(text,labelSource,metadata.catalog),formatted:bound?valueText(bound.value,bound.source,metadata.catalog)??messages.display.missingValue:messages.display.missingValue}]:[];
    }):[]:undefined;
    return <MetricChart
    host={context.host} installation={context.installation} digest={context.digest} metric={widget.metric} metadata={metadata}
    kind={widget.type==="bar_chart"?"bar":widget.type==="sparkline"?"sparkline":"line"} window={context.window} onWindow={context.onWindow} custom={context.custom} onCustom={context.onCustom} rangeControls={context.rangeControls??false}
    asOf={context.asOf} {...(currentSeries===undefined?{}:{currentSeries,currentSeriesLabel:fact?.kind==="table"?label(seriesTable?.title_key??fact.label_key):messages.display.series})}/>;
  }
  if(widget.type==="table"){
    const fact=facts.find((f)=>f.key===widget.source),source=display.sources[widget.source];
    if(!fact||fact.kind!=="table"||source?.kind!=="table"||widget.columns.some(c=>!fact.columns.some(fc=>fc.key===c.key&&fc.kind===source.columns[c.key]?.kind)))return <WidgetState/>;
    const seriesLabel=Object.values(display.metrics??{}).find(metric=>metric.value.fact===widget.source&&metric.series_label)?.series_label;
    const labelSource=seriesLabel?source.columns[seriesLabel]:undefined;
    const orderedRows=seriesLabel&&labelSource?[...fact.rows].sort((a,b)=>compareDisplayLabels(
      enumLabel(String(a[seriesLabel]??""),labelSource,metadata.catalog),enumLabel(String(b[seriesLabel]??""),labelSource,metadata.catalog))):fact.rows;
    const rows=orderedRows.map(row=>Object.fromEntries(widget.columns.map(c=>{
      const bound=boundValue(display,facts,{fact:widget.source,column:c.key},row),formatted=bound?valueText(bound.value,bound.source,metadata.catalog):null;
      if(c.meter){const numeric=numericBinding(display,facts,{fact:widget.source,column:c.key},row),model=meterModel(c.meter,display,facts,settings,assessment,row);
        if(!model){return[c.key,messages.display.missingValue];}
        return[c.key,<UsageMeter key={c.key} {...model} value={numeric?.number??null} formatted={formatted??messages.display.missingValue} label={label(c.label_key??bound?.label??widget.title_key)}/>];}
      return[c.key,formatted??messages.display.missingValue];})));
    return <DataTable rows={rows} columns={widget.columns.map(c=>({key:c.key,label:label(c.label_key??fact.columns.find(fc=>fc.key===c.key)!.label_key)}))} truncated={fact.truncated}/>;
  }
  if(widget.type==="donut"&&widget.parts){
    const parts=widget.parts.map(p=>({label:label(p.label_key),bound:numericBinding(display,facts,p.value)}));
    if(parts.some(p=>!p.bound))return <WidgetState/>;
    const unit=unitOf(parts[0]!.bound!.source);
    const totalFormatted=unit==="bytes"&&parts.every(p=>/^(0|[1-9][0-9]*)$/.test(p.bound!.raw))?numberText(parts.reduce((n,p)=>n+BigInt(p.bound!.raw),0n).toString(),unit):undefined;
    return <Donut parts={parts.map(p=>({label:p.label,value:p.bound!.number,formatted:valueText(p.bound!.value,p.bound!.source,metadata.catalog)!}))} format={n=>numberText(n,unit)} {...(totalFormatted?{totalFormatted}:{})}/>;
  }
  if(widget.type==="bar_chart"&&widget.mode==="snapshot"||widget.type==="donut"&&widget.source){
    const fact=facts.find(f=>f.key===widget.source);
    if(!fact||fact.kind!=="table"||fact.truncated)return <WidgetState/>;
    if(fact.rows.length>(widget.type==="donut"?8:32))return <WidgetState/>;
    const rows=fact.rows.map(row=>{const labelSource=boundValue(display,facts,{fact:widget.source,column:widget.label},row);
      return {label:labelSource?valueText(labelSource.value,labelSource.source,metadata.catalog):null,bound:numericBinding(display,facts,{fact:widget.source,column:widget.value},row)};});
    if(rows.some(r=>!r.bound||r.label===null))return <WidgetState/>;
    const source=display.sources[widget.source];if(source?.kind!=="table")return <WidgetState/>;
    const unit=unitOf(source.columns[widget.value]!);
    const props={rows:rows.map(r=>({label:r.label!,value:r.bound!.number,formatted:valueText(r.bound!.value,r.bound!.source,metadata.catalog)!})),format:(n:number)=>numberText(n,unit)};
    const totalFormatted=unit==="bytes"&&rows.every(r=>/^(0|[1-9][0-9]*)$/.test(r.bound!.raw))?numberText(rows.reduce((n,r)=>n+BigInt(r.bound!.raw),0n).toString(),unit):undefined;
    return widget.type==="donut"?<Donut parts={props.rows} format={props.format} {...(totalFormatted?{totalFormatted}:{})}/>:<BarChart {...props}/>;
  }
  return <WidgetState/>;
}
