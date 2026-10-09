"use client";
import { useEffect, useId, useRef, useState } from "react";
import { messages } from "@/i18n/messages";
import { usePackageCommand } from "./use-package-command";
import { PackageUpdateReview } from "./package-update-review";
import type { InstalledPackage } from "./package-model";
import { PlaybookButton } from "@/components/playbook/controls";
const t=messages.packageSkills;
type Receipt={installation_id:string;content_sha256:string;enabled:boolean;selected:boolean};
function receipt(value:unknown):Receipt{
  const v=value as {schema_version?:number;result?:Receipt},r=v?.result;
  if(v?.schema_version!==1||!r||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(r.installation_id)||
    !/^[a-f0-9]{64}$/.test(r.content_sha256)||typeof r.selected!=="boolean"||typeof r.enabled!=="boolean")throw Error("invalid_upload_response");
  return r;
}
export function PackageUpload({disabled=false,skills,saved,onLocked}:{disabled?:boolean;skills:InstalledPackage[];saved:()=>Promise<unknown>;onLocked:(value:boolean)=>void}){
  const command=usePackageCommand(),[file,setFile]=useState<File|null>(null),[invalid,setInvalid]=useState(false);
  const [uploaded,setUploaded]=useState<Receipt|null>(null),[completed,setCompleted]=useState("");
  const [updateLocked,setUpdateLocked]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null),input=useRef<HTMLInputElement>(null),title=useId();
  const locked=command.busy||command.uncertain||updateLocked,active=locked||!!uploaded;
  const skill=skills.find(s=>s.id===uploaded?.installation_id);
  useEffect(()=>{onLocked(active);return()=>onLocked(false);},[active,onLocked]);
  function clearFile(){setFile(null);if(input.current)input.current.value="";}
  async function upload(){if(file)await command.upload(file,saved,(value)=>{
    const next=receipt(value);
    if(next.selected){setCompleted(skills.some(s=>s.id===next.installation_id)?t.alreadyCurrent:t.newSkillAdded);clearFile();}
    else setUploaded(next);
  });}
  function updated(){setUploaded(null);setCompleted(t.updated);clearFile();}
  function close(){if(!locked)dialog.current?.close();}
  return <><PlaybookButton type="button" variant="secondary" className="tw-package-add tw-btn--sm" disabled={disabled||locked} onClick={()=>{dialog.current?.showModal();input.current?.focus();}}>
    <svg className="tw-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 5v14M5 12h14" /></svg>{messages.skills.add}</PlaybookButton>
    <dialog ref={dialog} className="tw-ui tw-dialog tw-package-upload" aria-labelledby={title} onCancel={(event)=>{if(locked)event.preventDefault();}}
      onClose={()=>{setUploaded(null);setCompleted("");}}
      onClick={(event)=>{if(event.target===dialog.current){const r=dialog.current.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}}}>
    <header className="tw-dialog__head"><div className="tw-dialog__titles"><h2 className="tw-dialog__title" id={title}>{t.upload}</h2></div><button type="button" className="tw-iconbtn" aria-label={messages.server.close} disabled={locked} onClick={close}>{messages.server.closeMark}</button></header>
    <div className="tw-dialog__body">
    {uploaded?skill?<PackageUpdateReview key={uploaded.content_sha256} skill={skill} digest={uploaded.content_sha256}
      disabled={disabled||command.busy} refresh={saved} onLocked={setUpdateLocked} complete={updated} />:
      <><p role="status">{t.loadingReview}</p><PlaybookButton disabled={locked} onClick={()=>void saved()}>{t.retryReview}</PlaybookButton></>:
    completed?<p role="status">{completed}</p>:<><p>{t.uploadHelp}</p><label>{t.zipFile}<input ref={input} type="file" accept=".zip,application/zip" disabled={disabled||locked}
      onChange={(e)=>{const next=e.target.files?.[0]??null;const bad=!!next&&(next.size>10*1024*1024||!next.size||!next.name.toLowerCase().endsWith(".zip"));setInvalid(bad);setFile(bad?null:next);}} /></label>
    {invalid?<p role="alert">{t.zipLimit}</p>:null}
    {file?<p>{file.name}</p>:null}
    <PlaybookButton type="button" disabled={disabled||command.busy||!file} onClick={()=>void upload()}>{command.uncertain?t.retryUpload:command.busy?t.uploading:t.uploadZip}</PlaybookButton>
    {command.notice?<p role="status">{command.notice}</p>:null}
    </>}
  </div></dialog></>;
}
