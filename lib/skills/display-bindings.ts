import type {Binding,ScalarSource,SkillDisplay,NumericReference,MeterOptions,DisplayStatus} from "./display-types";
import type {PackageFact,Scalar,SkillSettings,PackageAssessment} from "./package-types";
import {numericValue,sampleStatus} from "./display-values";
export function boundValue(display:SkillDisplay,facts:PackageFact[],binding:Binding,row?:Record<string,Scalar>) {
  const declaration=display.sources[binding.fact],fact=facts.find(f=>f.key===binding.fact);
  if (!declaration || !fact)return null;
  if (binding.column) {
    if (declaration.kind!=="table" || fact.kind!=="table" || !row)return null;
    const source=declaration.columns[binding.column],column=fact.columns.find(c=>c.key===binding.column);
    return source && column?.kind===source.kind ? {source,value:row[binding.column],label:column.label_key} : null;
  }
  return declaration.kind!=="table" && fact.kind===declaration.kind && "value" in fact ? {source:declaration,value:fact.value,label:fact.label_key} : null;
}
export function numericBinding(display:SkillDisplay,facts:PackageFact[],binding:Binding,row?:Record<string,Scalar>) {
  const bound=boundValue(display,facts,binding,row);if(!bound)return null;
  const value=numericValue(bound.value,bound.source);return value===null?null:{...bound,raw:value,number:Number(value)};
}
export function numericReference(reference:NumericReference,display:SkillDisplay,facts:PackageFact[],settings:SkillSettings,row?:Record<string,Scalar>) {
  if("value" in reference)return reference.value;
  if("setting" in reference)return typeof settings[reference.setting]==="number" ? settings[reference.setting] as number : null;
  return numericBinding(display,facts,reference,row)?.number??null;
}
export function meterModel(options:MeterOptions,display:SkillDisplay,facts:PackageFact[],settings:SkillSettings,assessment:PackageAssessment,row?:Record<string,Scalar>) {
  const min=numericReference(options.min,display,facts,settings,row),max=numericReference(options.max,display,facts,settings,row);
  if(min===null||max===null||!Number.isFinite(min)||!Number.isFinite(max)||min>=max)return null;
  const thresholds=[];
  for(const t of options.thresholds??[]){const value=numericReference(t.at,display,facts,settings,row);if(value===null||!Number.isFinite(value)||value<min||value>max)return null;thresholds.push({value,severity:t.severity});}
  if(new Set(thresholds.map(t=>t.value)).size!==thresholds.length)return null;
  let status:DisplayStatus="informational";
  if(options.status==="assessment")status=assessment.status;
  else if(options.status)status=sampleStatus(boundValue(display,facts,options.status,row)?.value);
  return {min,max,thresholds:thresholds.sort((a,b)=>a.value-b.value),status};
}
export function factSource(fact:PackageFact):ScalarSource|null {return fact.kind==="table"?null:{kind:fact.kind};}
