"use client";
import {useState} from "react";
import type {AgentMaintenance} from "@/lib/agent-updates";
import {messages} from "@/i18n/messages";
import {PlaybookButton} from "@/components/playbook/controls";
import {usePackageCommand} from "@/components/skills/use-package-command";
import {useOperatorRead} from "./use-operator-read";
import {time} from "./format";
const t=messages.agentUpdates;
export function validMaintenance(v:unknown):v is AgentMaintenance {
  if(!v||typeof v!=="object")return false;const r=v as AgentMaintenance;
  return Object.hasOwn(t.states,r.state)&&typeof r.running_version==="string"&&r.running_version.length<=64&&typeof r.automatic==="boolean"&&(r.override===null||typeof r.override==="boolean")&&(r.local_automatic===null||typeof r.local_automatic==="boolean")&&typeof r.revision==="string"&&typeof r.default_revision==="string"&&[r.available_version,r.newest_version].every(v=>v===null||typeof v==="string"&&v.length<=29)&&[r.observed_at,r.catalog_at,r.checked_at,r.updated_at].every(v=>v===null||typeof v==="string"&&v.length<=35&&Number.isFinite(Date.parse(v)));
}
export function MaintenanceBadge({value}:{value:AgentMaintenance|undefined}){
  if(!value||!["available","failed","app_required","manual_required","unrecognized"].includes(value.state))return null;
  return <span className="tw-pill tw-pill--off" title={t.notes[value.state]}>{t.states[value.state]}</span>;
}
type HostRead={schema_version:1;as_of:string;host_id:string;maintenance:AgentMaintenance};
function validHost(v:unknown):v is HostRead {const r=v as HostRead;return !!r&&r.schema_version===1&&typeof r.as_of==="string"&&Number.isFinite(Date.parse(r.as_of))&&typeof r.host_id==="string"&&validMaintenance(r.maintenance);}
export function AgentMaintenanceSection({hostId}:{hostId:string}){
  const read=useOperatorRead(`/api/v1/operator/hosts/${hostId}/agent-updates`,validHost,60000),v=read.value?.maintenance;
  return <section className="tw-ui tw-card"><header className="tw-card__head"><div className="tw-card__titles"><h2 className="tw-t-card">{t.agent}</h2>{v?<p>{t.states[v.state]}</p>:null}</div></header>
    <div className="tw-card__body">{v&&!read.expired?<><p>{read.failed?t.notes.unavailable:t.notes[v.state]}</p><dl className="tw-fields">{[[t.running,v.running_version],[t.available,v.available_version??t.never],[t.checked,time(v.checked_at,true)],[t.updated,time(v.updated_at,true)]].map(([label,value])=><div key={label}><dt className="tw-meta">{label}</dt><dd className="tw-mono">{value}</dd></div>)}</dl>
      {v.local_automatic===false?<p>{t.localOff}</p>:null}<PolicyChoice key={v.revision} value={v.override===null?"inherit":v.override?"on":"off"} revision={v.revision} url={`/api/v1/operator/hosts/${hostId}/agent-updates`} reload={read.reload} disabled={read.failed} inherit/>
      <p className="tw-note">{t.instructions}</p></>:<p role="status">{read.failed?messages.fleet.unavailable:messages.dashboard.loading}</p>}</div></section>;
}
export function PolicyChoice({value,revision,url,reload,inherit=false,disabled=false}:{value:string;revision:string;url:string;reload:()=>Promise<unknown>;inherit?:boolean;disabled?:boolean}){
  const [choice,setChoice]=useState(value),command=usePackageCommand(),locked=disabled||command.busy||command.uncertain;
  return <form onSubmit={e=>{e.preventDefault();void command.send(url,{expected_revision:revision,automatic:choice==="inherit"?null:choice==="on"},reload);}}>
    <label className="tw-field"><span className="tw-field__label">{t.automatic}</span><span className="tw-select"><select value={choice} disabled={locked} onChange={e=>setChoice(e.target.value)}>{inherit?<option value="inherit">{t.inherit}</option>:null}<option value="on">{t.on}</option><option value="off">{t.off}</option></select></span><span className="tw-field__note">{inherit?t.policyHelp:t.defaultHelp}</span></label>
    {command.notice?<p role="status">{command.notice}</p>:null}<PlaybookButton type="submit" disabled={locked||choice===value}>{t.save}</PlaybookButton>{command.uncertain?<PlaybookButton type="button" variant="secondary" disabled={command.busy} onClick={()=>void command.retry(reload)}>{messages.checks.retry}</PlaybookButton>:null}
  </form>;
}
