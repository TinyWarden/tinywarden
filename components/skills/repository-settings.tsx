"use client";
import {useEffect,useRef,useState} from "react";
import {messages} from "@/i18n/messages";
import {text,time} from "@/components/operator/format";
import {useOperatorRead} from "@/components/operator/use-operator-read";
import {ReadNotice} from "@/components/operator/shell";
import {PlaybookButton} from "@/components/playbook/controls";
import {repositoryUrl} from "@/lib/skills/repositories";
import {SettingsDialog,PlaybookIcon} from "@/components/playbook/skill";
import {usePackageCommand} from "./use-package-command";
import {validRepositories,repositoryError} from "./repository-model";
import type {RepositoryView} from "@/lib/skills/repositories";
const t=messages.marketplace;
export function RepositorySettings(){
  const read=useOperatorRead("/api/v2/operator/skill-repositories",validRepositories,60000),command=usePackageCommand(90000);
  const [url,setUrl]=useState(""),[remove,setRemove]=useState<RepositoryView|null>(null),[queued,setQueued]=useState<string|null>(null),attempted=useRef(new Set<string>());
  const locked=command.busy||command.uncertain;
  let urlReady=false;try{repositoryUrl(url.trim());urlReady=true;}catch{ /* An invalid address keeps Add disabled; the backend remains authoritative. */ }
  const why=!url.trim()?messages.uiForms.repoEmpty:!urlReady?messages.uiForms.repoInvalid:null;
  async function add(){await command.send("/api/v2/operator/skill-repositories",{url:url.trim()},read.reload,v=>{const r=v as {result:{repository_id:string}};setUrl("");setQueued(r.result.repository_id);});}
  async function change(r:RepositoryView,action:"enable"|"disable"|"remove"){
    await command.send(`/api/v2/operator/skill-repositories/${r.id}`,{expected_revision:r.revision,action},read.reload,()=>{if(action==="enable")setQueued(r.id);setRemove(null);});
  }
  useEffect(()=>{
    if(!queued||locked)return;const r=read.value?.repositories.find(r=>r.id===queued);
    if(r?.enabled&&!attempted.current.has(`${r.id}-${r.revision}`)){attempted.current.add(`${r.id}-${r.revision}`);void command.send(`/api/v2/operator/skill-repositories/${r.id}/refresh`,{expected_revision:r.revision},read.reload,()=>setQueued(null));}
  },[queued,locked,read.value,read.reload,command]);
  return <section className="tw-card"><header className="tw-card__head"><div className="tw-card__titles"><h2 className="tw-t-section">{t.repositories}</h2><p className="tw-t-secondary">{t.repositoryHelp}</p></div></header>
    <ReadNotice expired={read.expired} failed={read.failed} loaded={!!read.value}/>
    {command.notice?<div className="tw-card__row"><p role="status">{command.notice}{command.uncertain?<PlaybookButton type="button" disabled={command.busy} onClick={()=>void command.retry(read.reload)}><PlaybookIcon name="refresh"/>{t.retry}</PlaybookButton>:null}</p></div>:null}
    {read.value?.repositories.map(r=><article key={r.id} className="tw-card__row tw-card__row--actions"><div><div className="tw-field__head"><h3 className="tw-cell-entity">{r.name}</h3><span className="tw-tag tw-tag--state">{r.official?messages.packageSkills.official:messages.packageSkills.community}</span></div>
      <p className="tw-meta">{text(t.skillsCount,{count:r.count})}{messages.dashboard.separator}{r.checked_at?text(t.checked,{time:time(r.checked_at,true)}):t.neverChecked}</p>{r.error?<p role="alert">{repositoryError(r.error)}</p>:null}</div>
      <div className="tw-btns"><PlaybookButton variant="secondary" className="tw-btn--sm" disabled={locked||!r.enabled||read.expired} onClick={()=>void command.send(`/api/v2/operator/skill-repositories/${r.id}/refresh`,{expected_revision:r.revision},read.reload)}><PlaybookIcon name="refresh"/>{t.refresh}</PlaybookButton>
      <PlaybookButton variant="secondary" className="tw-btn--sm" disabled={locked||read.expired} onClick={()=>void change(r,r.enabled?"disable":"enable")}><PlaybookIcon name="settings"/>{r.enabled?t.disable:t.enable}</PlaybookButton>
      {!r.official?<PlaybookButton variant="secondary" className="tw-btn--sm" disabled={locked||read.expired} onClick={()=>setRemove(r)}><PlaybookIcon name="remove"/>{t.remove}</PlaybookButton>:null}</div></article>)}
    <footer className="tw-card__foot"><form className="tw-form-body" onSubmit={e=>{e.preventDefault();void add();}}><div className="tw-field"><label className="tw-field__label" htmlFor="repository-url">{t.repositoryUrl}</label><div className="tw-form-inline">
      <input id="repository-url" className="tw-input tw-input--mono" type="url" aria-describedby={why?'repository-url-note':undefined} required maxLength={300} value={url} disabled={locked} onChange={e=>setUrl(e.target.value)}/><PlaybookButton disabled={locked||!urlReady} type="submit"><PlaybookIcon name="plus"/>{t.addRepository}</PlaybookButton></div>{why?<span id="repository-url-note" className="tw-field__note">{why}</span>:null}</div></form></footer>
    {remove?<SettingsDialog title={t.remove} meta={remove.name} help={t.removeHelp} locked={locked} close={()=>setRemove(null)}>
      {command.notice&&command.notice!==messages.packageSkills.saved?<div className="tw-dialog__body"><p role="status">{command.notice}</p></div>:null}
      <footer className="tw-dialog__foot"><div className="tw-btns"><PlaybookButton variant="secondary" disabled={locked} onClick={()=>setRemove(null)}>{t.cancel}</PlaybookButton>
        <PlaybookButton disabled={command.busy} onClick={()=>void(command.uncertain?command.retry(read.reload):change(remove,"remove"))}>{command.uncertain?t.retry:t.remove}</PlaybookButton></div></footer>
    </SettingsDialog>:null}
  </section>;
}
