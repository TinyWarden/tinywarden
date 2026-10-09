import type {DisplayRole,DisplayWidget,SkillDisplay} from "./display-types";
import type {PackageFact} from "./package-types";
export const temporalWidget=(widget:DisplayWidget)=>widget.type==="line_chart"||widget.type==="sparkline"||widget.type==="bar_chart"&&widget.mode==="history";
export interface DisplaySection {id:string;role:DisplayRole;title_key:string;widgets:DisplayWidget[]}
/** Format 1 is normalized by widget type, never by a skill ID or English title. */
export function displayLayout(display:SkillDisplay):DisplaySection[] {
  if(display.format===2)return display.sections;
  return display.sections.flatMap(section=>(["current","graph"] as const).flatMap(role=>{
    const widgets=section.widgets.filter(widget=>temporalWidget(widget)===(role==="graph"));
    return widgets.length?[{id:section.id+"-"+role,role,title_key:section.title_key,widgets}]:[];
  }));
}
/** Only explicitly empty optional content disappears. Missing/broken bindings remain visible. */
export function detailWidgets(widgets:DisplayWidget[],display:SkillDisplay,facts:PackageFact[]):DisplayWidget[]{
  return widgets.flatMap<DisplayWidget>(widget=>{
    if(widget.type==="table"){
      const fact=facts.find(f=>f.key===widget.source);
      const source=display.sources[widget.source];
      const valid=fact?.kind==="table"&&source?.kind==="table"&&widget.columns.every(c=>fact.columns.some(fc=>fc.key===c.key&&fc.kind===source.columns[c.key]?.kind));
      return valid&&!fact.rows.length&&!fact.truncated?[]:[widget];
    }
    if(widget.type!=="facts")return [widget];
    const keys=widget.facts.filter(key=>{
      const source=display.sources[key],fact=facts.find(f=>f.key===key);
      return !(source?.kind==="text"&&!source.encoding&&!Object.hasOwn(source.enum??{},"")&&fact?.kind==="text"&&fact.value==="");
    });
    return keys.length?[{...widget,facts:keys}]:[];
  });
}
