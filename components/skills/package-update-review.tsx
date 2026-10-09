"use client";
import { useEffect } from "react";
import { messages } from "@/i18n/messages";
import { text } from "@/components/operator/format";
import { useOperatorRead } from "@/components/operator/use-operator-read";
import { usePackageCommand } from "./use-package-command";
import type { InstalledPackage } from "./package-model";
import type { PackageMetadata } from "@/lib/skills/package-types";
import { PackagePermissions } from "./package-permissions";
import { PackageIdentity } from "./package-identity";
import { PlaybookButton } from "@/components/playbook/controls";
const t=messages.packageSkills;
type Version={content_sha256:string;version:string;metadata:PackageMetadata;selected:boolean;compatible:boolean};
type Review={schema_version:1;as_of:string;versions:Version[]};
function valid(value:unknown):value is Review{
  const v=value as Review;
  return !!v&&v.schema_version===1&&typeof v.as_of==="string"&&Array.isArray(v.versions)&&v.versions.length===1&&
    v.versions.every(p=>/^[a-f0-9]{64}$/.test(p.content_sha256)&&typeof p.version==="string"&&typeof p.selected==="boolean"&&
      typeof p.compatible==="boolean"&&!!p.metadata?.manifest&&!!p.metadata.catalog);
}
export function PackageUpdateReview({skill,digest,disabled,refresh,onLocked,complete}:{skill:InstalledPackage;digest:string;
  disabled:boolean;refresh:()=>Promise<unknown>;onLocked:(v:boolean)=>void;complete:()=>void}){
  const read=useOperatorRead(`/api/v2/operator/skills/${skill.id}/version?content_sha256=${digest}`,valid,60000),command=usePackageCommand();
  const next=read.value?.versions[0],metadata=next?.content_sha256===digest?next.metadata:undefined,locked=command.busy||command.uncertain;
  useEffect(()=>{onLocked(locked);return()=>onLocked(false);},[locked,onLocked]);
  async function update(){
    if(command.uncertain){if(await command.retry(refresh))complete();return;}
    if(next&&metadata&&await command.send(`/api/v2/operator/skills/${skill.id}/version`,{
      content_sha256:digest,expected_enablement_version:skill.enablement_version,grants:metadata.manifest.capabilities},refresh))complete();
  }
  return <section className="tw-package-review" aria-label={t.reviewUpdate}><h3>{t.reviewUpdate}</h3>
    <p>{t.updateHelp}</p>
    {metadata?<><p>{text(t.updateVersion,{current:skill.metadata.manifest.version,next:metadata.manifest.version})}</p>
      <p>{text(t.byPublisher,{name:metadata.manifest.publisher})}{messages.dashboard.separator}{metadata.manifest.license}</p>
      <PackagePermissions metadata={metadata} open /><PackageIdentity digest={digest} /></>:null}
    {read.busy&&!metadata?<p role="status">{t.loadingReview}</p>:null}
    {read.failed?<><p role="alert">{t.reviewFailed}</p><PlaybookButton disabled={locked} onClick={()=>void read.reload()}>{t.retryReview}</PlaybookButton></>:null}
    {next&&!next.compatible?<p role="alert">{t.incompatibleUpdate}</p>:null}
    {next?.selected?<p role="status">{t.alreadyCurrent}</p>:null}
    <PlaybookButton disabled={command.busy||!command.uncertain&&(disabled||read.expired||read.failed||!metadata||next?.selected||!next?.compatible)}
      onClick={()=>void update()}>{command.uncertain?t.retryUpdate:command.busy?t.updating:t.updateSkill}</PlaybookButton>
    {command.notice?<p role="status">{command.notice}</p>:null}
  </section>;
}
