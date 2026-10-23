"use client";
import {useState} from "react";
import {messages} from "@/i18n/messages";
import {PlaybookButton} from "@/components/playbook/controls";
import {useOperatorCommand} from "@/components/operator/use-operator-command";
import {text,time} from "@/components/operator/format";
import {Field,FleetDialog,GroupChecks,CommandNotice} from "./fields";
import {splitTags,type GroupRow,type ServerRow} from "./model";
const t=messages.fleetManagement,a=messages.addServer;
export const installCommand='curl -fLO https://github.com/TinyWarden/tinywarden-agent/releases/latest/download/install.sh && sudo bash install.sh';
export function SetupDialog({groups,target,mode='new',close,reload}:{groups?:GroupRow[];target?:ServerRow;mode?:'new'|'replace'|'restore';close:()=>void;reload?:()=>Promise<unknown>}){
 const command=useOperatorCommand(15000,undefined,t.errors),[name,setName]=useState(target?.label??''),[selected,setSelected]=useState<string[]>([]),[tags,setTags]=useState(''),[setup,setSetup]=useState<{token_id:string;setup_code:string;expires_at:string}|null>(null),[copied,setCopied]=useState('');
 async function create(){await command.send('/api/v1/operator/servers/setup',{schema_version:2,mode,label:name,target_host_id:target?.host_id??null,expected_revision:target?.revision??null,groups:mode==='new'?selected:[],tags:mode==='new'?splitTags(tags):[]},reload??(async()=>{}),value=>{const v=value as typeof setup;if(v&&typeof v.setup_code==='string'&&v.setup_code.startsWith('tw_setup_v1.')&&v.setup_code.length<=4096&&typeof v.expires_at==='string')setSetup(v);});}
 async function copy(value:string,key:string){try{await navigator.clipboard.writeText(value);setCopied(key);}catch{setCopied('');}}
 const title=mode==='new'?t.addServer:mode==='restore'?t.restore:t.replace,locked=command.busy||command.uncertain;
 return <FleetDialog title={title} help={mode==='new'?t.setupHelp:mode==='restore'?t.restoreHelp:t.replaceHelp} close={close} locked={locked} actions={!setup?<PlaybookButton type="button" disabled={locked||!name.trim()} onClick={()=>void create()}>{t.createCode}</PlaybookButton>:null}>
  {!setup?<fieldset className="tw-form-body" disabled={locked}><Field label={t.name}><input className="tw-input" value={name} maxLength={100} disabled={mode!=='new'} onChange={e=>setName(e.target.value)}/></Field>{mode==='new'?<><GroupChecks groups={groups??[]} value={selected} change={setSelected}/><Field label={t.tags} help={t.tagsHelp}><input className="tw-input" value={tags} onChange={e=>setTags(e.target.value)}/></Field></>:null}</fieldset>:<><h3 className="tw-t-head">{a.command}</h3>{mode==='new'?<p>{a.steps}</p>:null}<div className="tw-token"><code className="tw-token__value">{mode==='new'?installCommand:'sudo /opt/tinywarden-agent/current/tinywarden-agent reconnect'}</code><PlaybookButton variant="secondary" type="button" className="tw-btn--sm" onClick={()=>void copy(mode==='new'?installCommand:'sudo /opt/tinywarden-agent/current/tinywarden-agent reconnect','command')}>{copied==='command'?a.copied:a.copy}</PlaybookButton></div><h3 className="tw-t-head">{a.code}</h3><div className="tw-token"><code className="tw-token__value">{setup.setup_code}</code><PlaybookButton variant="secondary" type="button" className="tw-btn--sm" onClick={()=>void copy(setup.setup_code,'code')}>{copied==='code'?a.copied:a.copy}</PlaybookButton></div><p className="tw-meta">{text(a.expires,{time:time(setup.expires_at,true)})}</p><p>{a.secret}</p></>}
  <CommandNotice command={command}/>
 </FleetDialog>;
}
