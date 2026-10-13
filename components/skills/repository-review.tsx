"use client";
import {useState} from "react";
import Link from "next/link";
import {SettingsDialog} from "@/components/playbook/skill";
import {PlaybookButton} from "@/components/playbook/controls";
import {messages} from "@/i18n/messages";
import {text} from "@/components/operator/format";
import {usePackageCommand} from "./use-package-command";
import {PackagePermissions} from "./package-permissions";
import {PackageCompatibility} from "./package-compatibility";
import {packageText} from "@/lib/skills/package-types";
import {prepared,repositoryError,type Offer,type Preparation} from "./repository-model";
const t=messages.marketplace;
/** One request identity survives ambiguous replies; reviewed bytes live server-side. */
export function RepositoryReview({offer,refresh,close}:{offer:Offer;refresh:()=>Promise<unknown>;close:()=>void}){
  const command=usePackageCommand(90000),[preparation,setPreparation]=useState<Preparation|null>(null),[problem,setProblem]=useState<string|null>(null),[done,setDone]=useState<string|null>(null);
  const locked=command.busy||command.uncertain,title=offer.status==="update"?t.reviewUpdate:offer.status==="connect"?t.reviewConnect:t.reviewInstall;
  async function prepare(){setProblem(null);await command.send("/api/v2/operator/skill-marketplace/prepare",{repository_id:offer.repository.id,skill_id:offer.entry.id,
    content_sha256:offer.entry.content_sha256,catalogue_revision:offer.repository.catalogue_revision},refresh,v=>{const r=prepared(v);setPreparation(r.preparation);setProblem(r.error);});}
  async function commit(){if(!preparation?.metadata)return;await command.send("/api/v2/operator/skill-marketplace/commit",{preparation_id:preparation.id,content_sha256:preparation.content_sha256,
    grants:preparation.metadata.manifest.capabilities},refresh,v=>{const r=v as {result?:{installation_id?:string}};if(!r.result?.installation_id)throw Error("invalid_response");setDone(r.result.installation_id);});}
  async function cancel(){if(preparation&&!done){await command.send("/api/v2/operator/skill-marketplace/cancel",{preparation_id:preparation.id},refresh,close);return;}close();}
  const metadata=preparation?.metadata;
  return <SettingsDialog title={title} meta={offer.repository.name} help={t.reviewHelp} locked={locked} close={()=>void cancel()}>
    <div className="tw-dialog__body">
      {done?<><p role="status">{offer.status==="update"?t.doneUpdate:offer.status==="connect"?t.doneConnect:t.doneInstall}</p><Link className="tw-link" href={`/skills?skill=${done}`}>{t.openInstalled}</Link></>:
      metadata?<><h3 className="tw-t-head">{packageText(metadata.catalog,{key:metadata.manifest.name_key,params:{}})}</h3>
        <p>{offer.installed_version?text(t.versionChange,{current:offer.installed_version,next:metadata.manifest.version}):`${messages.packageSkills.version} ${metadata.manifest.version}`}</p>
        <p>{text(messages.packageSkills.byPublisher,{name:metadata.manifest.publisher})}{messages.dashboard.separator}{metadata.manifest.license}</p>
        <PackageCompatibility metadata={metadata}/><p>{offer.status==="update"?t.updateHelp:offer.status==="connect"?t.connectHelp:t.installHelp}</p><PackagePermissions metadata={metadata} open />{preparation?.compatible===false?<p role="alert">{messages.packageSkills.incompatibleUpdate}</p>:null}</>:
      <><h3 className="tw-t-head">{offer.entry.name}</h3><p>{offer.entry.description}</p><p>{offer.status==="update"?t.updateHelp:offer.status==="connect"?t.connectHelp:t.installHelp}</p>
        {command.busy?<p role="status">{t.preparing}</p>:null}</>}
      {problem?<p className="tw-note" role="alert">{repositoryError(problem)}</p>:null}
      {command.notice&&command.notice!==messages.packageSkills.saved?<p role="status">{command.notice}</p>:null}
    </div><footer className="tw-dialog__foot"><div className="tw-btns">
      <PlaybookButton variant="secondary" disabled={locked} onClick={()=>void cancel()}>{done?t.close:t.cancel}</PlaybookButton>
      {!done?<PlaybookButton disabled={command.busy||!!metadata&&!preparation?.compatible&&!command.uncertain} onClick={()=>void(command.uncertain?command.retry(refresh):metadata?commit():prepare())}>
        {command.uncertain?t.retry:command.busy?t.preparing:metadata?(offer.status==="update"?t.confirmUpdate:offer.status==="connect"?t.confirmConnect:t.confirmInstall):t.reviewPackage}
      </PlaybookButton>:null}</div></footer>
  </SettingsDialog>;
}
