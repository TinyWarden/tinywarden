"use client";
import {useEffect,useRef,useState} from "react";
import type {TimeBounds} from "@/components/playbook/time-navigation";
import {messages} from "@/i18n/messages";
import {packageText,type PackageMetadata} from "@/lib/skills/package-types";
import type {AdaptiveHistory} from "@/lib/skills/metric-types";
import {compareDisplayLabels} from "@/lib/skills/display-values";
import {MetricFigure,ChartFrame} from "@/components/playbook/metric-figure";
import {SeriesPicker,type SeriesChoice} from "@/components/playbook/series-picker";
import {text} from "@/components/operator/format";
import {WidgetState,PlaybookButton} from "@/components/playbook/controls";
import {chartFetch} from "./metric-fetch";
import {HistoryRange} from "@/components/playbook/history";
import {historyWindows,type HistoryWindow} from "@/lib/skills/reading-types";
import {permissionEvent} from "@/components/operator/use-operator-read";

export function MetricChart({host,installation,digest,metric,metadata,kind,window,onWindow,rangeControls,asOf,custom,onCustom,currentSeries,currentSeriesLabel}:{
  host:string;installation:string;digest:string;metric:string;metadata:PackageMetadata;kind:"line"|"bar"|"sparkline";
  window:HistoryWindow;onWindow:(value:HistoryWindow)=>void;rangeControls:boolean;asOf:string;custom:TimeBounds|null;onCustom:(range:TimeBounds|null)=>void;
  currentSeries?:SeriesChoice[];currentSeriesLabel?:string;
}){
  const root=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(false),[series,setSeries]=useState(""),[reload,setReload]=useState(0);
  const orderedCurrent=currentSeries?.slice().sort((a,b)=>compareDisplayLabels(a.label,b.label));
  const selected=orderedCurrent?(orderedCurrent.some(choice=>choice.key===series)?series:orderedCurrent[0]?.key??""):series;
  const [result,setResult]=useState<{key:string;scope:string;directoryScope:string;view?:AdaptiveHistory;error?:string}|null>(null);
  const directoryScope=`${host}:${installation}:${digest}:${metric}:${custom?`${custom.from}:${custom.to}`:window}`;
  const selectionScope=`${directoryScope}:${selected}`;
  const end=Date.parse(asOf);
  const url=new URLSearchParams({view:"adaptive",digest,from:custom?.from??new Date(end-historyWindows[window]).toISOString(),to:new Date(end).toISOString(),buckets:"240"});if(selected)url.append("series",selected);
  const endpoint=`/api/v2/operator/hosts/${host}/skills/${installation}/metrics/${metric}?${url}`,requestKey=`${endpoint}:${reload}`;
  useEffect(()=>{const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))setVisible(true);});if(root.current)observer.observe(root.current);return()=>observer.disconnect();},[]);
  useEffect(()=>{if(!visible)return;const controller=new AbortController();async function load(){
    try{const response=await chartFetch(endpoint,controller.signal),body=await response.text();if(body.length>512*1024)throw new Error("range_too_large");const value=JSON.parse(body);
      if(response.status===401){document.dispatchEvent(new Event(permissionEvent));return;}
      if(!response.ok)throw new Error(value.error?.code??value.error??"unavailable");const view=value as AdaptiveHistory;
      if(view.format!==2||!["samples","buckets"].includes(view.representation)||view.host!==host||view.installation!==installation||view.digest!==digest||view.metric!==metric||!Array.isArray(view.series)||view.series.length>8||!Array.isArray(view.directory)||view.directory.length>32)throw new Error("unavailable");
      if(!controller.signal.aborted)setResult(old=>({key:requestKey,scope:selectionScope,directoryScope,view:selected&&old?.directoryScope===directoryScope&&old.view?{...view,directory:old.view.directory}:view}));
    }catch(error){if(!controller.signal.aborted)setResult(old=>({key:requestKey,scope:selectionScope,directoryScope,
      ...(old?.scope===selectionScope&&old.view?{view:old.view}:{}),error:error instanceof Error?error.message:"unavailable"}));}}
    void load();return()=>controller.abort();
  },[visible,endpoint,requestKey,host,installation,digest,metric,selected,selectionScope,directoryScope]);
  // A newer poll timestamp refreshes the same chart; only a changed selection
  // discards it. Keeping its DOM also preserves point focus and scroll.
  const current=result?.scope===selectionScope?result:null,t=messages.display;
  const choices=orderedCurrent??(result?.directoryScope===directoryScope?result.view?.directory.slice().sort((a,b)=>compareDisplayLabels(a.label,b.label)):undefined);
  const shownSeries=current?.view?.series.filter(s=>!currentSeries||currentSeries.some(choice=>choice.key===s.key));
  const chooseSeries=currentSeries?false:current?.view?.selection_required;
  const controls=rangeControls?<HistoryRange value={window} onChange={onWindow} custom={custom} onCustom={onCustom} from={custom?.from??new Date(end-historyWindows[window]).toISOString()} to={asOf}/>:null;
  const content=<>{!current?.view?current?.error?<>{currentSeries===undefined?controls:null}<WidgetState state="error">{current.error==="range_too_large"?t.rangeTooLarge:t.stateHelp.error}</WidgetState><PlaybookButton variant="secondary" onClick={()=>setReload(n=>n+1)}>{t.retry}</PlaybookButton></>:<WidgetState state="loading"/>:
    chooseSeries?<WidgetState state="empty">{t.selectSeries}</WidgetState>:
    shownSeries?.map((s,i)=><MetricFigure key={s.key} view={current.view!} series={s} version={metadata.manifest.version} windowLabel={custom?t.navigation.customRange:t.windows[window]} controls={currentSeries===undefined&&i===0?controls:null} kind={kind} framed={currentSeries===undefined}/>)}
    {current?.view&&!shownSeries?.length&&!chooseSeries?<>{currentSeries===undefined?controls:null}<WidgetState state="empty"/></>:null}
    {current?.view&&current.error?<p className="tw-t-secondary" role="status">{t.refreshFailed} <PlaybookButton variant="secondary" onClick={()=>setReload(n=>n+1)}>{t.retry}</PlaybookButton></p>:null}
  </>;
  const title=packageText(metadata.catalog,{key:metadata.display?.metrics?.[metric]?.title_key??"",params:{}});
  return <div ref={root} aria-busy={current?.key!==requestKey}>{currentSeries!==undefined?<ChartFrame title={text(t.chartTitle,{title,window:custom?t.navigation.customRange:t.windows[window]})} controls={controls} picker={<SeriesPicker choices={choices??[]} value={selected} onChange={setSeries} label={currentSeriesLabel??t.series}/>}>
    {content}</ChartFrame>:<>{choices&&(choices.length>1||selected)?<label className="tw-field__label">{t.series}<span className="tw-select"><select value={selected} onChange={e=>setSeries(e.target.value)}><option value="">{t.selectSeries}</option>{choices.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select></span></label>:null}{content}</>}</div>;
}
