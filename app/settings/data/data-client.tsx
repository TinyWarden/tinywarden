"use client";
import {useState} from "react";
import {messages} from "@/i18n/messages";
import {useOperatorRead} from "@/components/operator/use-operator-read";
import {useOperatorCommand} from "@/components/operator/use-operator-command";
import {postOperatorRead} from "@/components/operator/post-read";
import {ReadNotice} from "@/components/operator/shell";
import {compactDashboardTime,text,time} from "@/components/operator/format";
import {PlaybookButton} from "@/components/playbook/controls";
import {FactGrid} from "@/components/playbook/data";
import {SettingsShell} from "../settings-shell";
import {Field,FleetDialog,CommandNotice} from "../../fleet/_components/fields";
const t=messages.dataSettings;
type Policy={as_of?:string;schema_version:1;days:number;revision:string;cutoff:string;preview:{days:number;cutoff:string;confirmation:string}|null};
function valid(v:unknown):v is Policy{const r=v as Policy;return !!r&&r.schema_version===1&&Number.isInteger(r.days)&&r.days>=1&&r.days<=3650&&typeof r.revision==='string'&&Number.isFinite(Date.parse(r.cutoff));}
export function DataClient(){const read=useOperatorRead('/api/v1/operator/data-retention',valid,60000);return <SettingsShell active="data"><ReadNotice expired={read.expired} failed={read.failed} loaded={!!read.value}/>{read.value?<RetentionForm key={read.value.revision} policy={read.value} reload={read.reload} disabled={read.failed}/>:null}</SettingsShell>;}
function RetentionForm({policy,reload,disabled}:{policy:Policy;reload:()=>Promise<unknown>;disabled:boolean}){
 const [days,setDays]=useState(String(policy.days)),[preview,setPreview]=useState<Policy['preview']>(null),[previewBusy,setPreviewBusy]=useState(false),[notice,setNotice]=useState(''),command=useOperatorCommand(15000,undefined,t.errors),locked=command.busy||command.uncertain||disabled;
 async function save(confirmation:string|null=null){if(Number(days)<policy.days&&!confirmation){setPreviewBusy(true);try{const v=await postOperatorRead('/api/v1/operator/data-retention/preview',{days:Number(days)},AbortSignal.timeout(15000));if(!valid(v)||!v.preview)throw new Error('invalid');setPreview(v.preview);}catch{setNotice(messages.fleet.unavailable);}finally{setPreviewBusy(false);}return;}
  await command.send('/api/v1/operator/data-retention',{expected_revision:policy.revision,days:Number(days),confirmation},reload,()=>setPreview(null));
 }
 return <section className="tw-card"><header className="tw-card__head"><div className="tw-card__titles"><h2 className="tw-t-section">{t.retention}</h2><p className="tw-t-secondary">{t.help}</p></div></header><form onSubmit={e=>{e.preventDefault();void save();}}>
  <div className="tw-card__body tw-form-body"><Field label={t.days} help={t.range}><input className="tw-input" type="number" min={1} max={3650} step={1} required value={days} disabled={locked||previewBusy} onChange={e=>setDays(e.target.value)}/></Field><p className="tw-t-secondary">{t.scope}</p>{notice?<p role="alert">{notice}</p>:null}<CommandNotice command={command}/></div>
  <FactGrid band="top" facts={[{key:'days',label:t.current,value:text(t.keptDays,{days:policy.days})},{key:'cutoff',label:t.availableSince,value:<time dateTime={policy.cutoff} title={time(policy.cutoff,true)}>{policy.as_of?compactDashboardTime(Date.parse(policy.cutoff),policy.as_of).label:time(policy.cutoff,true)}</time>}]}/>
  <footer className="tw-card__foot"><PlaybookButton type="submit" disabled={locked||previewBusy||Number(days)===policy.days||!Number.isInteger(Number(days))||Number(days)<1||Number(days)>3650}>{t.change}</PlaybookButton></footer>
 </form>{preview?<FleetDialog title={t.reduceTitle} help={t.reduceHelp} close={()=>setPreview(null)} locked={locked} actions={<PlaybookButton type="button" variant="danger" disabled={locked} onClick={()=>void save(preview.confirmation)}>{t.confirm}</PlaybookButton>}><p>{text(t.reduceSummary,{days:preview.days,date:time(preview.cutoff,true)})}</p><p>{t.irreversible}</p><p className="tw-t-secondary">{t.backup}</p><CommandNotice command={command}/></FleetDialog>:null}</section>;
}
