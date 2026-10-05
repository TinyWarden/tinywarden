"use client";
import { useEffect, useState } from "react";
import { messages } from "@/i18n/messages";
import { usePackageCommand } from "./use-package-command";
const t=messages.packageSkills;
export function PackageUpload({disabled=false,saved,onLocked}:{disabled?:boolean;saved:()=>Promise<unknown>;onLocked:(value:boolean)=>void}){
  const command=usePackageCommand(),[file,setFile]=useState<File|null>(null),[invalid,setInvalid]=useState(false);
  const locked=command.busy||command.uncertain;
  useEffect(()=>{onLocked(locked);return()=>onLocked(false);},[locked,onLocked]);
  async function upload(){if(file && await command.upload(file,saved)){setFile(null);}}
  return <details className="tw-package-upload"><summary>{t.upload}</summary>
    <p>{t.uploadHelp}</p><label>{t.zipFile}<input type="file" accept=".zip,application/zip" disabled={disabled||locked}
      onChange={(e)=>{const next=e.target.files?.[0]??null;const bad=!!next&&(next.size>10*1024*1024||!next.size||!next.name.toLowerCase().endsWith(".zip"));setInvalid(bad);setFile(bad?null:next);}} /></label>
    {invalid?<p role="alert">{t.zipLimit}</p>:null}
    {file?<p>{file.name}</p>:null}
    <button type="button" disabled={disabled||command.busy||!file} onClick={()=>void upload()}>{command.uncertain?t.retryUpload:command.busy?t.uploading:t.installDisabled}</button>
    {command.notice?<p role="status">{command.notice}</p>:null}
  </details>;
}
