"use client";
import {useState} from "react";
import {SettingsDialog} from "@/components/playbook/skill";
import {PlaybookButton} from "@/components/playbook/controls";
import {messages} from "@/i18n/messages";
import {permissionEvent} from "./use-operator-read";
import {text,time} from "./format";
const t=messages.addServer;
const installCommand='tw_install_dir=$(mktemp -d) && curl --fail --location --proto "=https" --proto-redir "=https" --output "$tw_install_dir/install.sh" https://github.com/TinyWarden/tinywarden-agent/releases/latest/download/install.sh && sudo bash "$tw_install_dir/install.sh" && rm -rf -- "$tw_install_dir"';
type Setup={setup_code:string;expires_at:string;token_id:string};
export function AddServer({close}:{close:()=>void}){
  const [name,setName]=useState(""),[setup,setSetup]=useState<Setup|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[copied,setCopied]=useState(""),[lost,setLost]=useState<string|null>(null);
  const [pending,setPending]=useState<{id:string;name:string}|null>(null);
  async function create(){
    if(busy)return;setBusy(true);setNotice("");const request=pending??{id:crypto.randomUUID(),name};setPending(request);
    try{
      const r=await fetch("/api/v1/operator/servers/setup",{method:"POST",credentials:"same-origin",signal:AbortSignal.timeout(15000),headers:{"Content-Type":"application/json","X-TinyWarden-Request":"1"},body:JSON.stringify({schema_version:1,request_id:request.id,label:request.name})});
      if(r.status===401){document.dispatchEvent(new Event(permissionEvent));close();return;}
      const v=await r.json();
      if(r.ok&&v.schema_version===1&&typeof v.setup_code==="string"&&v.setup_code.startsWith("tw_setup_v1.")&&v.setup_code.length<=4096&&Number.isFinite(Date.parse(v.expires_at))&&typeof v.token_id==="string"){setSetup(v);setPending(null);return;}
      if(v.error?.code==="token_already_issued"&&typeof v.error.token_id==="string"){setLost(v.error.token_id);setNotice(t.lost);setPending(null);return;}
      if(r.status>=500)throw new Error("uncertain");setPending(null);setNotice(t.invalid);
    }catch{setNotice(t.failed);}finally{setBusy(false);}
  }
  async function revoke(){
    if(!lost||busy)return;setBusy(true);
    try{const r=await fetch(`/api/v1/operator/enrollment-tokens/${encodeURIComponent(lost)}/revoke`,{method:"POST",credentials:"same-origin",signal:AbortSignal.timeout(15000),headers:{"Content-Type":"application/json","X-TinyWarden-Request":"1"},body:JSON.stringify({schema_version:1})});if(r.status===401){document.dispatchEvent(new Event(permissionEvent));close();return;}if(!r.ok)throw new Error("failed");setLost(null);setNotice("");setPending(null);}catch{setNotice(t.failed);}finally{setBusy(false);}
  }
  async function copy(value:string,key:string){try{await navigator.clipboard.writeText(value);setCopied(key);}catch{setCopied("");}}
  return <div className="tw-ui"><SettingsDialog title={t.title} meta={messages.dashboard.navServers} help={t.help} close={close} locked={busy}>
    <div className="tw-dialog__body">{!setup?<form onSubmit={e=>{e.preventDefault();void create();}}><label className="tw-field"><span className="tw-field__label">{t.name}</span><input className="tw-input" value={name} maxLength={100} disabled={busy||!!pending||!!lost} onChange={e=>setName(e.target.value)}/></label>{notice?<p role="status">{notice}</p>:null}
      {lost?<PlaybookButton type="button" onClick={()=>void revoke()} disabled={busy}>{t.revoke}</PlaybookButton>:<PlaybookButton disabled={busy||!name.trim()}>{pending?t.retry:t.create}</PlaybookButton>}
    </form>:<><p>{t.steps}</p><h3 className="tw-t-head">{t.command}</h3><div className="tw-token"><code className="tw-token__value">{installCommand}</code><PlaybookButton variant="secondary" type="button" className="tw-btn--sm" onClick={()=>void copy(installCommand,"command")}>{copied==="command"?t.copied:t.copy}</PlaybookButton></div>
      <p className="tw-note">{t.custom}</p><h3 className="tw-t-head">{t.code}</h3><div className="tw-token"><code className="tw-token__value">{setup.setup_code}</code><PlaybookButton variant="secondary" type="button" className="tw-btn--sm" onClick={()=>void copy(setup.setup_code,"code")}>{copied==="code"?t.copied:t.copy}</PlaybookButton></div><p className="tw-meta">{text(t.expires,{time:time(setup.expires_at,true)})}</p><p className="tw-note">{t.secret}</p></>}
    </div><footer className="tw-dialog__foot"><PlaybookButton variant="secondary" type="button" disabled={busy} onClick={close}>{t.close}</PlaybookButton></footer>
  </SettingsDialog></div>;
}
