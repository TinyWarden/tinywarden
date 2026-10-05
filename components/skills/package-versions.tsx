"use client";
import { useCallback, useEffect, useState } from "react";
import { messages } from "@/i18n/messages";
import { useOperatorRead } from "@/components/operator/use-operator-read";
import { usePackageCommand } from "./use-package-command";
import type { InstalledPackage } from "./package-model";
import type { PackageMetadata } from "@/lib/skills/package-types";
import { PackagePermissions } from "./package-permissions";
const t=messages.packageSkills;
type Version={content_sha256:string;version:string;metadata?:PackageMetadata;selected:boolean;compatible:boolean};
type Versions={schema_version:1;as_of:string;versions:Version[]};
function valid(v:unknown):v is Versions{const s=v as Versions;return !!s&&s.schema_version===1&&typeof s.as_of==="string"&&Array.isArray(s.versions)&&s.versions.length<=100&&s.versions.every((p)=>/^[0-9a-f]{64}$/.test(p.content_sha256)&&typeof p.version==="string"&&typeof p.compatible==="boolean"&&(!p.metadata||!!p.metadata.manifest&&!!p.metadata.catalog));}
export function PackageVersions({skill,disabled,saved,onLocked}:{skill:InstalledPackage;disabled:boolean;saved:()=>Promise<unknown>;onLocked:(v:boolean)=>void}){
  const read=useOperatorRead(`/api/v2/operator/skills/${skill.id}/version`,valid,60000);
  const [digest,setDigest]=useState("");
  const reload=read.reload;
  const done=useCallback(async()=>{await saved();await reload();setDigest("");},[saved,reload]);
  const [locked,setLocked]=useState(false);
  const lock=useCallback((v:boolean)=>{setLocked(v);onLocked(v);},[onLocked]);
  return <details className="tw-package-versions"><summary>{t.versions}</summary>
    <p>{t.versionHelp}</p><button disabled={locked||read.expired} onClick={()=>void reload()}>{t.refreshVersions}</button>
    {read.failed?<p role="alert">{t.versionsFailed}</p>:null}
    <ul>{read.value?.versions.map((p)=><li key={p.content_sha256}><button type="button" disabled={disabled||locked||read.failed||read.expired||p.selected||!p.compatible}
      onClick={()=>setDigest(p.content_sha256)}>{p.version}{p.selected?` — ${t.selected}`:!p.compatible?` — ${t.incompatible}`:""}</button></li>)}</ul>
    {digest?<VersionReview key={digest} skill={skill} digest={digest} disabled={disabled} saved={done} onLocked={lock} cancel={()=>setDigest("")} />:null}
  </details>;
}
function VersionReview({skill,digest,disabled,saved,onLocked,cancel}:{skill:InstalledPackage;digest:string;disabled:boolean;saved:()=>Promise<unknown>;onLocked:(v:boolean)=>void;cancel:()=>void}){
  const read=useOperatorRead(`/api/v2/operator/skills/${skill.id}/version?content_sha256=${digest}`,valid,60000),command=usePackageCommand();
  const next=read.value?.versions[0],metadata=next?.metadata,locked=command.busy||command.uncertain;
  useEffect(()=>{onLocked(locked);return()=>onLocked(false);},[locked,onLocked]);
  async function choose(){if(next&&metadata)await command.send(`/api/v2/operator/skills/${skill.id}/version`,{content_sha256:next.content_sha256,
    expected_enablement_version:skill.enablement_version,grants:metadata.manifest.capabilities},saved);}
  return <section aria-label={t.reviewVersion}><h3>{t.reviewVersion}</h3>
    {metadata?<><p>{metadata.manifest.publisher}{messages.dashboard.separator}{next.version}</p><code className="tw-package-digest">{digest}</code><PackagePermissions metadata={metadata} open /></>:null}
    {read.failed?<p role="alert">{t.versionsFailed}</p>:null}
    <button disabled={disabled||command.busy||read.expired||read.failed||!metadata||next?.selected||!next?.compatible} onClick={()=>void choose()}>{command.uncertain?t.retry:t.useVersion}</button>
    <button disabled={locked} onClick={cancel}>{t.cancel}</button>
    {command.notice?<p role="status">{command.notice}</p>:null}
  </section>;
}
