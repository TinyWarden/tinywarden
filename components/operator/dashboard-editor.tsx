"use client";
import {useState} from "react";
import {messages} from "@/i18n/messages";
import {columnKey,type DashboardLayout,type DashboardLayoutView,type DashboardColumn} from "@/lib/skills/dashboard-types";
import {SettingsDialog,Disclosure} from "@/components/playbook/skill";
import {PlaybookButton} from "@/components/playbook/controls";
import {usePackageCommand} from "@/components/skills/use-package-command";
import {useOperatorRead} from "./use-operator-read";
import {validLayoutRead} from "./dashboard-validation";
const t=messages.dashboardCustomize;
export function DashboardEditor({close,saved}:{close:()=>void;saved:()=>Promise<unknown>}){
  const read=useOperatorRead("/api/v1/operator/dashboard/layout",validLayoutRead,Infinity),command=usePackageCommand();
  const locked=command.busy||command.uncertain;
  return <div className="tw-ui"><SettingsDialog title={t.title} help={t.help} meta={messages.dashboard.navDashboard} locked={locked} close={close}>
    {command.notice?<p role="status" className="tw-dialog__body">{command.notice}</p>:null}
    {read.value&&!read.expired?<Draft key={read.value.revision} view={read.value} locked={locked} uncertain={command.uncertain} busy={command.busy} close={close} save={async layout=>{
      const ok=await command.send("/api/v1/operator/dashboard/layout",{expected_revision:read.value!.revision,layout},async()=>{await read.reload();});if(ok){await saved();close();}
    }} retry={()=>{void (async()=>{const ok=await command.retry(()=>read.reload());if(ok){await saved();close();}})();}}/>:<div className="tw-dialog__body"><p role="status">{read.failed?t.failed:messages.dashboard.loading}</p>{read.failed?<PlaybookButton onClick={()=>void read.reload()}>{messages.checks.retry}</PlaybookButton>:null}</div>}
  </SettingsDialog></div>;
}
function Draft({view,locked,uncertain,busy,close,save,retry}:{view:DashboardLayoutView;locked:boolean;uncertain:boolean;busy:boolean;close:()=>void;save:(layout:DashboardLayout)=>Promise<void>;retry:()=>void}){
  const [layout,setLayout]=useState(view.layout),columns=layout.sections[0].columns,selected=new Set(columns.map(columnKey));
  function toggle(column:DashboardColumn,on:boolean){setLayout(old=>({...old,sections:[{...old.sections[0],columns:on?[...old.sections[0].columns,column.ref]:old.sections[0].columns.filter(ref=>columnKey(ref)!==columnKey(column.ref))},old.sections[1]]}));}
  const choice=(column:DashboardColumn)=><label className="tw-check" key={columnKey(column.ref)}><input type="checkbox" checked={selected.has(columnKey(column.ref))} disabled={locked||columns.length>=32&&!selected.has(columnKey(column.ref))} onChange={e=>toggle(column,e.target.checked)}/><span>{column.label}{!column.available?<span className="tw-meta">{messages.dashboard.separator}{t.unavailable}</span>:null}</span></label>;
  const missing=view.columns.filter(c=>!c.available);
  return <><div className="tw-dialog__body tw-dashboard-options"><p>{t.required}</p>
    <div className="tw-card"><Disclosure title={t.serverInfo} initialOpen><div className="tw-dashboard-choices">{view.catalog.server.map(choice)}</div></Disclosure>
      {view.catalog.skills.map(skill=><Disclosure key={skill.id} title={skill.name} meta={!skill.enabled?messages.skills.offLabel:undefined}><div className="tw-dashboard-choices">{skill.fields.length?skill.fields.map(choice):<p>{t.noFields}</p>}</div></Disclosure>)}
      {missing.length?<Disclosure title={t.unavailable}><div className="tw-dashboard-choices">{missing.map(choice)}</div></Disclosure>:null}
    </div><label className="tw-check"><input type="checkbox" checked={layout.sections[1].visible} disabled={locked} onChange={e=>setLayout(old=>({...old,sections:[old.sections[0],{...old.sections[1],visible:e.target.checked}]}))}/>{t.changes}</label><p>{t.changesHelp}</p>
    {columns.length>=32?<p role="status">{t.limit}</p>:null}</div><footer className="tw-dialog__foot"><PlaybookButton variant="secondary" disabled={locked} onClick={close}>{messages.packageSkills.cancel}</PlaybookButton>
      {uncertain?<PlaybookButton disabled={busy} onClick={retry}>{messages.packageSkills.retry}</PlaybookButton>:<PlaybookButton disabled={locked||JSON.stringify(layout)===JSON.stringify(view.layout)} onClick={()=>void save(layout)}>{messages.packageSkills.save}</PlaybookButton>}</footer></>;
}
