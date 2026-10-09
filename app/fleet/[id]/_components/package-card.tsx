"use client";
import {PackageRunNow} from "@/components/skills/package-run-now";
import type {TimeBounds} from "@/components/playbook/time-navigation";
import {useState} from "react";
import {messages} from "@/i18n/messages";
import {text} from "@/components/operator/format";
import {historyWindows,type HistoryWindow} from "@/lib/skills/reading-types";
import {PackageHistory} from "@/components/skills/package-history";
import type {PackageResults} from "@/components/skills/package-model";
import {PackageDisplay} from "@/components/skills/package-display";
import {PackageSettingsDialog} from "@/components/skills/package-settings-dialog";
import {SkillFrame,SkillSlot,sampleTime,cadenceLabel} from "@/components/playbook/skill";
import "@/components/skills/packages.css";
const t=messages.packageSkills;
export function PackageCard({skill,view,hostLabel,outdated,controlsOutdated=false,saved}:{skill:PackageResults["skills"][number];view:PackageResults;hostLabel:string;outdated:boolean;controlsOutdated?:boolean;saved:()=>Promise<unknown>}){
  const [settingsOpen,setSettingsOpen]=useState(false),state=outdated&&skill.state!=="disabled"?"unknown":skill.state;
  const reason=outdated?t.unknown:skill.reason==="skill_assessment"?skill.reason_text:(t.errors as Record<string,string>)[skill.reason]??t.unknown;
  const assessment=skill.assessment??skill.sample_assessment;
  const [timeline,setTimeline]=useState<{digest:string;window:HistoryWindow;anchor:string|null;custom:TimeBounds|null;open:boolean;revision:number}>({digest:skill.content_sha256,window:"24h",anchor:null,custom:null,open:false,revision:0});
  const selected=timeline.digest===skill.content_sha256?timeline:{digest:skill.content_sha256,window:"24h" as const,anchor:null,custom:null,open:false,revision:0};
  const asOf=selected.custom?.to??selected.anchor??view.as_of,from=selected.custom?.from??new Date(Date.parse(asOf)-historyWindows[selected.window]).toISOString();
  const onWindow=(window:HistoryWindow)=>setTimeline({...selected,window,custom:null,anchor:selected.open?view.as_of:null,revision:selected.revision+1});
  const onCustom=(custom:TimeBounds|null)=>setTimeline({...selected,custom,anchor:selected.open?view.as_of:null,revision:selected.revision+1});
  return <SkillFrame id={skill.key} title={skill.name} status={state} summary={reason} onSettings={()=>setSettingsOpen(true)} actions={<PackageRunNow host={view.host_id} skill={skill} outdated={controlsOutdated} saved={saved} onSettings={()=>setSettingsOpen(true)}/>}
    meta={<>{t.version} {skill.metadata.manifest.version}{assessment?<>{messages.dashboard.separator}{messages.display.lastChecked}{messages.dashboard.separator}{skill.measured_at?sampleTime(skill.measured_at):t.unknown}{skill.interval_seconds?messages.dashboard.separator+text(messages.display.every,{interval:cadenceLabel(skill.interval_seconds)}):null}</>:null}</>}>
    {outdated||!skill.assessment?<SkillSlot><p className="tw-t-secondary">{messages.display.stateHelp.stale}</p></SkillSlot>:null}
    {assessment&&skill.settings?<PackageDisplay metadata={skill.metadata} assessment={assessment} settings={skill.settings} host={view.host_id} installation={skill.installation_id} digest={skill.content_sha256} asOf={asOf} window={selected.window} onWindow={onWindow} custom={selected.custom} onCustom={onCustom}/>:null}
    <PackageHistory host={view.host_id} installation={skill.installation_id} from={from} to={asOf} window={selected.window} onWindow={onWindow} custom={selected.custom} onCustom={onCustom}
      open={selected.open} onOpen={open=>setTimeline({...selected,open,anchor:open?view.as_of:null,revision:selected.revision+1})}
      refresh={()=>setTimeline({...selected,anchor:view.as_of,revision:selected.revision+1})} revision={selected.revision}/>
    {settingsOpen?<PackageSettingsDialog skill={skill} host={view.host_id} hostLabel={hostLabel} saved={saved} close={()=>setSettingsOpen(false)}/>:null}
  </SkillFrame>;
}
