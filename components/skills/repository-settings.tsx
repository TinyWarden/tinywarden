"use client";
import {useEffect,useRef,useState} from "react";
import {messages} from "@/i18n/messages";
import {text,time} from "@/components/operator/format";
import {useOperatorRead} from "@/components/operator/use-operator-read";
import {ReadNotice} from "@/components/operator/shell";
import {PlaybookButton} from "@/components/playbook/controls";
import {SettingsDialog} from "@/components/playbook/skill";
import {usePackageCommand} from "./use-package-command";
import {validRepositories,repositoryError} from "./repository-model";
import type {RepositoryView} from "@/lib/skills/repositories";
const t=messages.marketplace;
export function RepositorySettings(){
  const read=useOperatorRead("/api/v2/operator/skill-repositories",validRepositories,60000),command=usePackageCommand(90000);
  const [url,setUrl]=useState(""),[remove,setRemove]=useState<RepositoryView|null>(null),[queued,setQueued]=useState<string|null>(null),attempted=useRef(new Set<string>());
  const locked=command.busy||command.uncertain;
  async function add(){await command.send("/api/v2/operator/skill-repositories",{url},read.reload,v=>{const r=v as {result:{repository_id:string}};setUrl("");setQueued(r.result.repository_id);});}
  async function change(r:RepositoryView,action:"enable"|"disable"|"remove"){
    await command.send(`/api/v2/operator/skill-repositories/${r.id}`,{expected_revision:r.revision,action},read.reload,()=>{if(action==="enable")setQueued(r.id);setRemove(null);});
  }
  useEffect(()=>{
    if(!queued||locked)return;const r=read.value?.repositories.find(r=>r.id===queued);
    if(r?.enabled&&!attempted.current.has(`${r.id}-${r.revision}`)){attempted.current.add(`${r.id}-${r.revision}`);void command.send(`/api/v2/operator/skill-repositories/${r.id}/refresh`,{expected_revision:r.revision},read.reload,()=>setQueued(null));}
  },[queued,locked,read.value,read.reload,command]);
  return <section className="tw-card"><header className="tw-card__head"><div className="tw-card__titles"><h2 className="tw-t-card">{t.repositories}</h2><p className="tw-t-secondary">{t.repositoryHelp}</p></div></header>
    <div className="tw-card__body"><form className="tw-repository-form" onSubmit={e=>{e.preventDefault();void add();}}>
      <label className="tw-field"><span className="tw-field__label">{t.repositoryUrl}</span><input className="tw-input" type="url" required maxLength={300} value={url} disabled={locked} onChange={e=>setUrl(e.target.value)}/></label>
      <div className="tw-btns"><PlaybookButton disabled={locked||!url} type="submit">{t.addRepository}</PlaybookButton></div>
    </form><ReadNotice expired={read.expired} failed={read.failed} loaded={!!read.value}/>
    {command.notice?<p role="status">{command.notice}{command.uncertain?<PlaybookButton disabled={command.busy} onClick={()=>void command.retry(read.reload)}>{t.retry}</PlaybookButton>:null}</p>:null}
    <div className="tw-list">{read.value?.repositories.map(r=><article key={r.id} className="tw-repository-item"><div><h3 className="tw-t-head">{r.name}</h3>
      <p className="tw-meta">{r.official?messages.packageSkills.official:messages.packageSkills.community}{messages.dashboard.separator}{text(t.skillsCount,{count:r.count})}</p>
      <p className="tw-t-secondary">{r.checked_at?text(t.checked,{time:time(r.checked_at,true)}):t.neverChecked}</p>{r.error?<p role="alert">{repositoryError(r.error)}</p>:null}</div>
      <div className="tw-btns"><PlaybookButton variant="secondary" disabled={locked||read.expired} onClick={()=>void change(r,r.enabled?"disable":"enable")}>{r.enabled?t.disable:t.enable}</PlaybookButton>
        <PlaybookButton variant="secondary" disabled={locked||!r.enabled||read.expired} onClick={()=>void command.send(`/api/v2/operator/skill-repositories/${r.id}/refresh`,{expected_revision:r.revision},read.reload)}>{t.refresh}</PlaybookButton>
        {!r.official?<PlaybookButton variant="secondary" disabled={locked||read.expired} onClick={()=>setRemove(r)}>{t.remove}</PlaybookButton>:null}</div>
    </article>)}</div></div>
    {remove?<SettingsDialog title={t.remove} meta={remove.name} help={t.removeHelp} locked={locked} close={()=>setRemove(null)}>
      {command.notice&&command.notice!==messages.packageSkills.saved?<div className="tw-dialog__body"><p role="status">{command.notice}</p></div>:null}
      <footer className="tw-dialog__foot"><div className="tw-btns"><PlaybookButton variant="secondary" disabled={locked} onClick={()=>setRemove(null)}>{t.cancel}</PlaybookButton>
        <PlaybookButton disabled={command.busy} onClick={()=>void(command.uncertain?command.retry(read.reload):change(remove,"remove"))}>{command.uncertain?t.retry:t.remove}</PlaybookButton></div></footer>
    </SettingsDialog>:null}
  </section>;
}
