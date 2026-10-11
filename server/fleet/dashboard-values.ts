import type {DashboardCell,DashboardColumn} from "../../lib/skills/dashboard-types";
import {columnKey} from "../../lib/skills/dashboard-types";
import {boundValue,meterModel,numericBinding} from "../../lib/skills/display-bindings";
import {enumLabel} from "../../lib/skills/display-values";
import {valueText} from "../../components/playbook/format";
import type {FleetEvidence} from "../skills/results/fleet-evidence";
import type {ScalarSource} from "../../lib/skills/display-types";
function short(value:string){const bytes=Buffer.from(value);return {text:bytes.length>192?new TextDecoder().decode(bytes.subarray(0,192)).replace(/\uFFFD$/u,""):value,truncated:bytes.length>192};}
export function dashboardValues(evidence:FleetEvidence,columns:DashboardColumn[]):Record<string,DashboardCell>{
  return Object.fromEntries(columns.map(column=>{
    const empty:DashboardCell={state:"unavailable",value:null,source:null,context:null,truncated:false,meter:null,measured_at:null,valid_until:null},ref=column.ref;
    if(ref.kind==="server"){
      const value=ref.field==="os"?`${evidence.host.os_id} ${evidence.host.os_version}`:evidence.credential?.agent_version??evidence.host.enrolled_agent_version;
      const clipped=short(value);return [columnKey(ref),{...empty,state:"value",value:clipped.text,source:{kind:"text"},truncated:clipped.truncated}];
    }
    const skill=evidence.packages?.find(s=>s.metadata.manifest.id===ref.skill_id),display=skill?.metadata.display,field=display?.dashboard?.fields.find(f=>f.id===ref.field_id);
    if(!skill||!field||!display)return [columnKey(ref),empty];
    const cell={...empty,state:skill.state,measured_at:skill.measured_at,valid_until:skill.valid_until};
    if(!skill.assessment)return [columnKey(ref),cell];
    const bound=boundValue(display,skill.assessment.facts,field.value);
    if(!bound||bound.value===undefined||valueText(bound.value,bound.source,skill.metadata.catalog)===null)return [columnKey(ref),cell];
    const source:ScalarSource={kind:bound.source.kind,...(bound.source.encoding?{encoding:bound.source.encoding}:{}),...(bound.source.unit?{unit:bound.source.unit}:{}),...(bound.source.precision===undefined?{}:{precision:bound.source.precision}),...(bound.source.semantic?{semantic:bound.source.semantic}:{})};
    cell.source=source;cell.value=bound.value;
    if(source.kind==="text"&&!source.encoding){const clipped=short(enumLabel(String(bound.value),bound.source,skill.metadata.catalog));cell.value=clipped.text;cell.truncated=clipped.truncated;}
    if(field.context){const context=boundValue(display,skill.assessment.facts,field.context);if(context&&typeof context.value==="string"){const clipped=short(enumLabel(context.value,context.source,skill.metadata.catalog));cell.context=clipped.text;cell.truncated ||= clipped.truncated;}}
    if(field.type==="meter"){
      const numeric=numericBinding(display,skill.assessment.facts,field.value),model=meterModel(field,display,skill.assessment.facts,skill.settings??{},skill.assessment);
      if(!numeric||!model)return [columnKey(ref),{...cell,value:null,source:null,context:null}];
      cell.meter={...model,status:skill.state==="unknown"?"unknown":model.status};
    }
    return [columnKey(ref),cell];
  }));
}
