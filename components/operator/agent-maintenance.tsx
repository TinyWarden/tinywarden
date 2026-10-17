"use client";
import {useId,useState,type ReactNode} from "react";
import {useIsAdmin} from "./session-provider";
import type {AgentMaintenance} from "@/lib/agent-updates";
import {messages} from "@/i18n/messages";
import {SettingsDialog,PlaybookIcon} from "@/components/playbook/skill";
import {FactGrid} from "@/components/playbook/data";
import {FieldHelp} from "@/components/playbook/field-help";
import {PlaybookButton} from "@/components/playbook/controls";
import {usePackageCommand} from "@/components/skills/use-package-command";
import {useOperatorRead} from "./use-operator-read";
import {time} from "./format";
const t=messages.agentUpdates;
export function validMaintenance(v:unknown):v is AgentMaintenance {
  if(!v||typeof v!=="object")return false;const r=v as AgentMaintenance;
  return Object.hasOwn(t.states,r.state)&&typeof r.running_version==="string"&&r.running_version.length<=64&&typeof r.automatic==="boolean"&&(r.override===null||typeof r.override==="boolean")&&(r.local_automatic===null||typeof r.local_automatic==="boolean")&&typeof r.revision==="string"&&typeof r.default_revision==="string"&&[r.available_version,r.newest_version].every(v=>v===null||typeof v==="string"&&v.length<=29)&&[r.observed_at,r.catalog_at,r.checked_at,r.updated_at].every(v=>v===null||typeof v==="string"&&v.length<=35&&Number.isFinite(Date.parse(v)));
}
const maintenanceTones={current:"healthy",available:"warning",updating:"running",confirming:"running",failed:"warning",manual:"off",unavailable:"unknown",app_required:"warning",manual_required:"warning",unrecognized:"warning"} as const;
function AgentUpdatePill({state}:{state:AgentMaintenance["state"]}){
  return <span className={`tw-pill tw-pill--${maintenanceTones[state]}`} title={t.notes[state]}>{t.states[state]}</span>;
}
export function MaintenanceBadge({value}:{value:AgentMaintenance|undefined}){
  if(!value||!["available","failed","app_required","manual_required","unrecognized"].includes(value.state))return null;
  return <AgentUpdatePill state={value.state}/>;
}
type HostRead={schema_version:1;as_of:string;host_id:string;maintenance:AgentMaintenance};
function validHost(v:unknown):v is HostRead {const r=v as HostRead;return !!r&&r.schema_version===1&&typeof r.as_of==="string"&&Number.isFinite(Date.parse(r.as_of))&&typeof r.host_id==="string"&&validMaintenance(r.maintenance);}
export function AgentSettingsButton({hostId,hostName}:{hostId:string;hostName:string}){
  const admin=useIsAdmin(),[open,setOpen]=useState(false);
  return <><PlaybookButton variant="secondary" type="button" aria-haspopup="dialog" onClick={()=>setOpen(true)}><PlaybookIcon name="settings"/>{admin?t.agentSettings:t.agentDetails}</PlaybookButton>
    {open?<AgentSettingsDialog hostId={hostId} hostName={hostName} close={()=>setOpen(false)}/>:null}</>;
}
function AgentSettingsDialog({hostId,hostName,close}:{hostId:string;hostName:string;close:()=>void}){
  const admin=useIsAdmin(),read=useOperatorRead(`/api/v1/operator/hosts/${hostId}/agent-updates`,validHost,60000),v=read.value?.maintenance;
  if(v&&!read.expired)return <AgentSettingsDraft key={v.revision} hostId={hostId} hostName={hostName} value={v} admin={admin} disabled={read.failed} reload={read.reload} close={close}/>;
  return <SettingsDialog title={admin?t.agentSettings:t.agentDetails} meta={hostName} help={t.help} close={close}><div className="tw-dialog__body"><p role="status">{read.failed?messages.fleet.unavailable:messages.dashboard.loading}</p>
    {read.failed?<PlaybookButton variant="secondary" onClick={()=>void read.reload()}>{messages.checks.retry}</PlaybookButton>:null}</div><footer className="tw-dialog__foot"><PlaybookButton variant="secondary" onClick={close}>{messages.access.close}</PlaybookButton></footer></SettingsDialog>;
}
function AgentSettingsDraft({hostId,hostName,value:v,admin,disabled,reload,close}:{hostId:string;hostName:string;value:AgentMaintenance;admin:boolean;disabled:boolean;reload:()=>Promise<unknown>;close:()=>void}){
  const formId=useId(),initial=v.override===null?"inherit":v.override?"on":"off",[choice,setChoice]=useState(initial),command=usePackageCommand(),locked=command.busy||command.uncertain;
  return <SettingsDialog title={admin?t.agentSettings:t.agentDetails} meta={hostName} help={t.help} close={close} locked={locked}>
    <div className="tw-dialog__body"><div className="tw-btns"><AgentUpdatePill state={disabled?"unavailable":v.state}/></div><p className="tw-t-secondary">{disabled?t.notes.unavailable:t.notes[v.state]}</p>
      <FactGrid facts={[{key:"running",label:t.running,value:v.running_version,mono:true},{key:"available",label:t.available,value:v.available_version??t.never,mono:true},
        {key:"checked",label:t.checked,value:time(v.checked_at,true),mono:true},{key:"updated",label:t.updated,value:time(v.updated_at,true),mono:true}]}/>
      {v.local_automatic===false?<p className="tw-t-secondary">{t.localOff}</p>:null}
      {admin?<form id={formId} className="tw-agent-policy" onSubmit={e=>{e.preventDefault();if(!disabled&&!locked)void command.send(`/api/v1/operator/hosts/${hostId}/agent-updates`,{expected_revision:v.revision,automatic:choice==="inherit"?null:choice==="on"},reload);}}>
        <PolicyField choice={choice} change={setChoice} disabled={disabled||locked} inherit/></form>:null}
      {command.notice?<p role="status">{command.notice}</p>:null}<p className="tw-t-secondary">{t.instructions}</p>
    </div><footer className="tw-dialog__foot"><PlaybookButton variant="secondary" disabled={locked} onClick={close}>{messages.access.close}</PlaybookButton>
      {admin?(command.uncertain?<PlaybookButton type="button" disabled={command.busy} onClick={()=>void command.retry(reload)}>{messages.checks.retry}</PlaybookButton>:<PlaybookButton type="submit" form={formId} disabled={disabled||locked||choice===initial}>{t.save}</PlaybookButton>):null}</footer>
  </SettingsDialog>;
}
function PolicyField({choice,change,disabled,inherit=false}:{choice:string;change:(value:string)=>void;disabled:boolean;inherit?:boolean}){
  const id=useId();
  return <div className="tw-field"><div className="tw-field__head"><label htmlFor={id} className="tw-field__label">{t.automatic}</label><FieldHelp id={id+'-help'} label={t.automatic} help={inherit?t.policyHelp:t.defaultHelp}/></div><span className="tw-select"><select id={id} aria-describedby={id+'-help'} value={choice} disabled={disabled} onChange={e=>change(e.target.value)}>{inherit?<option value="inherit">{t.inherit}</option>:null}<option value="on">{t.on}</option><option value="off">{t.off}</option></select></span></div>;
}

export function PolicyChoice({value,revision,url,reload,inherit=false,disabled=false,children,onDirty}:{value:string;revision:string;url:string;reload:()=>Promise<unknown>;inherit?:boolean;disabled?:boolean;children?:ReactNode;onDirty?:(dirty:boolean)=>void}){
 const id=useId(),[choice,setChoice]=useState(value),command=usePackageCommand(),locked=disabled||command.busy||command.uncertain,dirty=choice!==value;
 const change=(v:string)=>{setChoice(v);onDirty?.(v!==value);};
 return <form onSubmit={e=>{e.preventDefault();void command.send(url,{expected_revision:revision,automatic:choice==="inherit"?null:choice==="on"},async()=>{onDirty?.(false);return reload();});}}>
 <div className="tw-card__body tw-form-body">{inherit?<PolicyField choice={choice} change={change} disabled={locked} inherit/>:<div className="tw-field"><div className="tw-field__head"><span className="tw-field__label">{t.automatic}</span><FieldHelp id={id+'-help'} label={t.automatic} help={t.defaultHelp}/>{dirty?<span className="tw-tag">{messages.uiForms.changed}</span>:null}</div><div className="tw-seg" role="radiogroup" aria-label={t.automatic} aria-describedby={id+'-help'} onKeyDown={e=>{if(locked)return;if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'on':e.key==='End'?'off':choice==='on'?'off':'on';change(next);e.currentTarget.querySelector<HTMLButtonElement>(`[data-choice="${next}"]`)?.focus();}}}>
 {(['on','off'] as const).map(key=><button type="button" className="tw-seg__opt" role="radio" aria-checked={choice===key} tabIndex={choice===key?0:-1} data-choice={key} disabled={locked} key={key} onClick={()=>change(key)}>{t[key]}</button>)}</div></div>}
 {command.notice?<p role="status">{command.notice}</p>:null}</div>{children}
 <footer className="tw-card__foot"><PlaybookButton type="submit" disabled={locked||!dirty}><PlaybookIcon name="check"/>{t.save}</PlaybookButton>{command.uncertain?<PlaybookButton type="button" variant="secondary" disabled={command.busy} onClick={()=>void command.retry(reload)}><PlaybookIcon name="refresh"/>{messages.checks.retry}</PlaybookButton>:null}</footer></form>;
}
