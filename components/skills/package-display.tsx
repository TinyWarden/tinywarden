"use client";
import type {TimeBounds} from "@/components/playbook/time-navigation";
import {messages} from "@/i18n/messages";
import {packageText,type PackageMetadata,type PackageAssessment,type SkillSettings} from "@/lib/skills/package-types";
import type {HistoryWindow} from "@/lib/skills/reading-types";
import {displayLayout,detailWidgets} from "@/lib/skills/display-layout";
import {Disclosure,SkillSlot} from "@/components/playbook/skill";
import {PackageFacts} from "./package-facts";
import {DisplayWidgetView,type DisplayContext} from "./display-widget";
export function PackageDisplay({metadata,assessment,settings,host,installation,digest,asOf,window,onWindow,custom,onCustom}:{metadata:PackageMetadata;assessment:PackageAssessment;settings:SkillSettings;host:string;installation:string;digest:string;asOf:string;window:HistoryWindow;onWindow:(value:HistoryWindow)=>void;custom:TimeBounds|null;onCustom:(range:TimeBounds|null)=>void}){
  const display=metadata.display;if(!display)return <SkillSlot><PackageFacts facts={assessment.facts} catalog={metadata.catalog}/></SkillSlot>;
  const label=(key:string)=>packageText(metadata.catalog,{key,params:{}});
  const context:DisplayContext={metadata,display,assessment,settings,host,installation,digest,asOf,window,onWindow,custom,onCustom};
  const layout=displayLayout(display),firstGraph=layout.find(section=>section.role==="graph")?.widgets[0]?.id;
  const sections=layout.flatMap(original=>{
    const section=original.role==="details"?{...original,widgets:detailWidgets(original.widgets,display,assessment.facts)}:original;
    if(!section.widgets.length)return [];
    const widgets=section.widgets.map(widget=>{
      const controls=widget.id===firstGraph;
      return <div className="tw-display-widget" key={widget.id}>{section.widgets.length===1?null:<h4 className="tw-t-head">{label(widget.title_key)}</h4>}
        {DisplayWidgetView({widget,context:{...context,rangeControls:controls}})}{widget.help_key?<p className="tw-t-secondary">{label(widget.help_key)}</p>:null}</div>;
    });
    return [{role:section.role,view:<SkillSlot key={section.id} title={label(section.title_key)} flush={section.widgets.every(w=>w.type==="facts")}>{widgets}</SkillSlot>}];
  });
  const details=sections.filter(s=>s.role==="details");
  return <>{sections.filter(s=>s.role==="current").map(s=>s.view)}{sections.filter(s=>s.role==="graph").map(s=>s.view)}
    {details.length?<SkillSlot padded={false}><Disclosure title={messages.display.details}>{details.map(s=>s.view)}</Disclosure></SkillSlot>:null}</>;
}
