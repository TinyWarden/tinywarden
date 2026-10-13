"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {messages} from "@/i18n/messages";
import {text,time} from "@/components/operator/format";
import {useOperatorRead} from "@/components/operator/use-operator-read";
import {ReadNotice} from "@/components/operator/shell";
import {PlaybookButton} from "@/components/playbook/controls";
import {CardPagination} from "@/components/playbook/pagination";
import {PlaybookIcon} from "@/components/playbook/skill";
import {usePackageCommand} from "./use-package-command";
import {validMarketplace,repositoryError,type Offer} from "./repository-model";
import {RepositoryReview} from "./repository-review";
import {PackageUpload} from "./package-upload";
import type {InstalledPackage} from "./package-model";
const t=messages.marketplace;
export function SkillsMarketplace({installedRefresh,skills,uploadsDisabled}:{installedRefresh:()=>Promise<unknown>;skills:InstalledPackage[];uploadsDisabled:boolean}){
  const [query,setQuery]=useState(""),[repository,setRepository]=useState(""),[page,setPage]=useState(1),[review,setReview]=useState<Offer|null>(null);
  const [uploadLocked,setUploadLocked]=useState(false);
  const params=new URLSearchParams({q:query,page:String(page)});if(repository)params.set("repository",repository);
  const read=useOperatorRead(`/api/v2/operator/skill-marketplace?${params}`,validMarketplace,60000),command=usePackageCommand(90000),attempted=useRef(new Set<string>());
  const repos=read.value?.repositories??[],locked=command.busy||command.uncertain||uploadLocked;
  async function refresh(){for(const r of repos.filter(r=>r.enabled&&(!repository||r.id===repository)))if(!await command.send(`/api/v2/operator/skill-repositories/${r.id}/refresh`,{expected_revision:r.revision},read.reload))break;}
  useEffect(()=>{
    if(locked)return;
    const r=read.value?.repositories.find(r=>r.enabled&&(!repository||r.id===repository)&&(!r.checked_at||Date.now()-Date.parse(r.checked_at)>86400000)&&!attempted.current.has(r.id));
    if(r){attempted.current.add(r.id);void command.send(`/api/v2/operator/skill-repositories/${r.id}/refresh`,{expected_revision:r.revision},read.reload);}
  },[read.value,read.reload,command,locked,repository]);
  const saved=async()=>{await Promise.all([read.reload(),installedRefresh()]);};
  return <section className="tw-marketplace" aria-label={t.browse}>
    <div className="tw-card"><div className="tw-card__head"><div className="tw-card__titles"><h2 className="tw-t-card">{t.browse}</h2><p className="tw-t-secondary">{t.browseHelp}</p></div></div>
      <div className="tw-card__body"><div className="tw-marketplace-tools">
        <div className="tw-search tw-search--plain"><input type="search" maxLength={100} value={query} aria-label={t.search} placeholder={t.search} onChange={e=>{setQuery(e.target.value);setPage(1);}} /></div>
        <div className="tw-select"><select aria-label={t.repositories} value={repository} onChange={e=>{setRepository(e.target.value);setPage(1);}}><option value="">{t.allRepositories}</option>{repos.filter(r=>r.enabled).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
        <div className="tw-btns"><PlaybookButton variant="secondary" disabled={locked||!repos.some(r=>r.enabled)} onClick={()=>void(command.uncertain?command.retry(read.reload):refresh())}><PlaybookIcon name="refresh"/>{command.uncertain?t.retry:t.checkUpdates}</PlaybookButton><Link className="tw-btn tw-btn--secondary" href="/settings/repositories"><PlaybookIcon name="repository"/>{t.repositories}</Link><PackageUpload skills={skills} disabled={uploadsDisabled||command.busy||command.uncertain||read.expired} saved={saved} onLocked={setUploadLocked}/></div>
      </div></div>
      <ReadNotice expired={read.expired} failed={read.failed} loaded={!!read.value}/>
      {command.uncertain?<p className="tw-note" role="status">{command.notice}</p>:null}
      {repos.filter(r=>r.enabled&&r.error).map(r=><p key={r.id} className="tw-note" role="alert">{r.name}{messages.dashboard.separator}{repositoryError(r.error)} {r.count?t.cached:""}</p>)}
      <div className="tw-list">{read.value?.offers.map(offer=><article key={`${offer.repository.id}-${offer.entry.id}`} className="tw-marketplace-item">
        <div><h3 className="tw-t-head">{offer.entry.name}</h3><p className="tw-t-secondary">{offer.entry.description}</p><p className="tw-meta">{offer.repository.official?messages.packageSkills.official:messages.packageSkills.community}{messages.dashboard.separator}{offer.repository.name}{messages.dashboard.separator}{offer.entry.version}</p></div>
        <div>{["install","update","connect"].includes(offer.status)?<PlaybookButton variant={offer.status==="update"?"primary":"secondary"} disabled={locked||read.expired||!!offer.repository.error} onClick={()=>setReview(offer)}>{offer.status==="update"?t.update:offer.status==="connect"?t.connect:t.install}</PlaybookButton>:
          <span className="tw-t-secondary">{offer.status==="current"?t.current:offer.status==="older"?t.older:t.conflict}</span>}</div>
      </article>)}</div>
      {read.value&&!read.value.offers.length?<p className="tw-note">{repos.some(r=>r.enabled&&r.checked_at)?t.empty:t.noCatalogue}</p>:null}
      {read.value?<CardPagination page={page} total={read.value.total} count={read.value.offers.length} pageSize={50} loading={read.busy} onPage={setPage} itemLabel={t.ofSkills}/>:null}
    </div><p className="tw-t-secondary">{repos.filter(r=>r.enabled&&r.checked_at).map(r=>`${r.name}: ${text(t.checked,{time:time(r.checked_at!,true)})}`).join(messages.dashboard.separator)}</p>
    {review?<RepositoryReview offer={review} refresh={saved} close={()=>setReview(null)}/>:null}
  </section>;
}
