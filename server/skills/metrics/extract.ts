import {UINT64_MAX,numericValue,containsControl,enumLabel} from "../../../lib/skills/display-values";
import {boundValue} from "../../../lib/skills/display-bindings";
import {packageText,type PackageAssessment,type PackageMetadata} from "../../../lib/skills/package-types";
import type {MetricFlag} from "../../db/metric-types";
export function metricDecimal(raw:string):string|null{
  let value=raw;
  if(!/^-?(0|[1-9][0-9]*)(\.[0-9]{1,9})?$/.test(value)){
    const number=Number(value);if(!Number.isFinite(number)||Math.abs(number)>Number(UINT64_MAX))return null;
    value=number.toFixed(9);
  }
  const negative=value.startsWith("-"),unsigned=negative?value.slice(1):value;
  const [whole,fraction=""]=unsigned.split(".");
  const scaled=BigInt(whole!)*1000000000n+BigInt(fraction.padEnd(9,"0"));
  if(scaled>UINT64_MAX*1000000000n)return null;
  const result=unsigned.includes(".")?unsigned.replace(/0+$/,"").replace(/\.$/,""):unsigned;
  return scaled===0n?"0":(negative?"-":"")+result;
}
export function extractMetrics(metadata:PackageMetadata,assessment:PackageAssessment|null,outcome:string){
  const display=metadata.display,flags:Record<string,MetricFlag>={},samples:{metric_key:string;series_key:string;label:string;value:string}[]=[];
  if(!display?.metrics)return {flags,samples};
  for(const [metric_key,metric]of Object.entries(display.metrics)){
    if(!assessment||outcome!=="observed"){flags[metric_key]={error:"reading_failed"};continue;}
    const candidates=[] as typeof samples,flag:MetricFlag={},facts=assessment.facts;
    if(!metric.value.column){
      const bound=boundValue(display,facts,metric.value),raw=bound?numericValue(bound.value,bound.source):null,value=raw===null?null:metricDecimal(raw);
      const label=packageText(metadata.catalog,{key:metric.title_key,params:{}});
      if(value===null)flag.error="value_missing";
      else if(Buffer.byteLength(label)>256)flag.error="series_invalid";
      else candidates.push({metric_key,series_key:"scalar",label,value});
    }else{
      const fact=facts.find(f=>f.key===metric.value.fact),seen=new Set<string>();
      if(!fact||fact.kind!=="table")flag.error="source_missing";
      else if(fact.rows.length>(metric.max_series??16))flag.error="series_limit";
      else{
        if(fact.truncated)flag.incomplete=true;
        for(const row of fact.rows){
          const identity=row[metric.series_key!],label=row[metric.series_label!];
          if(typeof identity!=="string"||Buffer.byteLength(identity)<1||Buffer.byteLength(identity)>128||containsControl(identity)||seen.has(identity)||typeof label!=="string"||Buffer.byteLength(label)>256){flag.error="series_invalid";break;}
          seen.add(identity);
          const bound=boundValue(display,facts,metric.value,row),raw=bound?numericValue(bound.value,bound.source):null,value=raw===null?null:metricDecimal(raw);
          if(value===null){(flag.missing??=[]).push(identity);continue;}
          const declaration=display.sources[metric.value.fact];
          const labelSource=declaration?.kind==="table"?declaration.columns[metric.series_label!]:undefined;
          const displayLabel=labelSource?enumLabel(label,labelSource,metadata.catalog):label;
          if(Buffer.byteLength(displayLabel)>256){flag.error="series_invalid";break;}
          candidates.push({metric_key,series_key:identity,label:displayLabel,value});
        }
      }
    }
    flags[metric_key]=flag;
    if(!flag.error)samples.push(...candidates);
  }
  return {flags,samples};
}
