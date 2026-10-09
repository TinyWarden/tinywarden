"use client";
import {useState} from "react";
import {messages} from "@/i18n/messages";
import type {AdaptiveHistory} from "@/lib/skills/metric-types";
import {SkillFrame,SkillSlot,Disclosure,SettingsDialog} from "./skill";
import {FactGrid} from "./data";
import {CollectionLog,HistoryNavigation,HistoryRange} from "./history";
import {MetricFigure} from "./metric-figure";
import {PlaybookButton} from "./controls";
import {InheritanceExample} from "@/app/playbook/example";
import {text} from "@/components/operator/format";
export function CompleteSkillExample(){
  const [settings,setSettings]=useState(false),[window,setWindow]=useState<"24h"|"7d"|"30d"|"90d">("24h"),t=messages.display.playbook;
  const end=Date.parse("2026-10-07T15:40:00.000Z"),first=Date.parse("2026-10-07T06:55:00.000Z");
  const points=Array.from({length:7},(_,i)=>({at:new Date(first+i*3600000).toISOString(),value:"0",valid_until:new Date(first+(i+2)*3600000).toISOString(),incomplete:false,connect_from_previous:i>0,reasons:[]}));
  const durations={"24h":86400000,"7d":7*86400000,"30d":30*86400000,"90d":90*86400000},from=new Date(end-durations[window]).toISOString(),to=new Date(end).toISOString();
  const view:AdaptiveHistory={format:2,representation:"samples",host:"",installation:"",digest:"",versions:[{digest:"",version:"1.0.0"}],metric:"example",title:t.demoSample,unit:"count",requested:{from,to},applied:{from,to},as_of:to,retained_cutoff:new Date(end-90*86400000).toISOString(),first_available:points[0]!.at,directory:[{key:"scalar",label:t.demoSample}],selection_required:false,
    series:[{key:"scalar",label:t.demoSample,first_available:points[0]!.at,summary:{readings:7,last:"0",last_at:points.at(-1)!.at},points,gaps:[{from,to:points[0]!.at,reason:"before_first_retained",coarse:false}]}]};
  const facts=[{key:"count",label:t.demoSample,value:"0",mono:true},{key:"assurance",label:t.demoAssurance,value:t.demoAssuranceValue,muted:true}];
  return <SkillFrame id="playbook-complete-skill" title={t.demoSkill} status="healthy" summary={t.demoSummary} meta={t.demoMeta} onSettings={()=>setSettings(true)}>
    <SkillSlot title={t.demoCapacity} flush><FactGrid facts={Array.from({length:4},(_,i)=>({key:String(i),label:text(t.demoCountLabel,{number:i+1}),value:"0",mono:true}))}/></SkillSlot>
    <SkillSlot title={t.line}><MetricFigure view={view} series={view.series[0]!} version="1.0.0" windowLabel={messages.display.windows[window]} controls={<HistoryRange value={window} onChange={setWindow}/>}/></SkillSlot>
    <SkillSlot padded={false}><Disclosure title={messages.display.details}><div className="tw-skill__slot--pad"><FactGrid facts={facts}/></div></Disclosure></SkillSlot>
    <SkillSlot padded={false}><Disclosure title={messages.display.history}><div className="tw-skill__slot--pad"><HistoryRange value={window} onChange={setWindow}/><CollectionLog rows={[...points].reverse().map((p,i)=>({id:String(i),at:p.at,finished_at:p.at,received_at:p.at,outcome:"observed",status:"healthy",note:null,current:true,version:"1.0.0"}))}/><HistoryNavigation page={1} total={7} count={7} loading={false}/></div></Disclosure></SkillSlot>
    {settings?<SettingsDialog title={t.demoSettings} meta={t.demoServer} help={t.demoSettingsHelp} close={()=>setSettings(false)}><div className="tw-dialog__body"><InheritanceExample id="playbook-modal-interval"/></div><div className="tw-dialog__foot"><PlaybookButton variant="secondary" onClick={()=>setSettings(false)}>{messages.server.close}</PlaybookButton><PlaybookButton onClick={()=>setSettings(false)}>{messages.packageSkills.save}</PlaybookButton></div></SettingsDialog>:null}
  </SkillFrame>;
}
