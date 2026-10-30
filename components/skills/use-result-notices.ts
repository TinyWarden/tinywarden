"use client";
import {useEffect,useRef,useState} from 'react';
import {consumeAuthority} from '@/components/operator/authority';
import {permissionEvent} from '@/components/operator/use-operator-read';
import {dismissibleOperationNotice,type SkillOperationSummary} from '@/lib/maintenance/operation-summary';

const version=(job:SkillOperationSummary)=>`${job.job_id}:${job.updated_at}`;
/** Save an account UI preference without putting task controls into a pending state. */
export function useResultNotices(reload:()=>Promise<unknown>){
 const pending=useRef<AbortController|null>(null),[saving,setSaving]=useState<string|null>(null),[failed,setFailed]=useState<string|null>(null),[hidden,setHidden]=useState<string|null>(null);
 useEffect(()=>{const clear=()=>{pending.current?.abort();pending.current=null;setSaving(null);setHidden(null);setFailed(null);};document.addEventListener(permissionEvent,clear);
  return()=>{pending.current?.abort();pending.current=null;document.removeEventListener(permissionEvent,clear);};},[]);
 async function dismiss(job:SkillOperationSummary){
  if(pending.current||!dismissibleOperationNotice(job))return false;
  const controller=new AbortController();pending.current=controller;setSaving(job.job_id);setFailed(null);
  const timeout=window.setTimeout(()=>controller.abort(),10000);
  try{
   const response=await fetch('/api/v1/operator/operation-notices/dismiss',{method:'POST',credentials:'same-origin',signal:controller.signal,
    headers:{'Content-Type':'application/json','X-TinyWarden-Request':'1'},body:JSON.stringify({schema_version:1,job_id:job.job_id,expected_updated_at:job.updated_at})});
   if(response.status===401||response.status===403){document.dispatchEvent(new Event(permissionEvent));return false;}
   const value=await response.json();
   if(controller.signal.aborted||pending.current!==controller)return false;
   if(!response.ok){setFailed(job.job_id);if(response.status===409)await reload();return false;}
   if(value.schema_version!==1||value.job_id!==job.job_id||value.dismissed!==true)throw Error('invalid_notice_response');
   consumeAuthority(value);setHidden(version(job));await reload();return true;
  }catch{if(pending.current===controller)setFailed(job.job_id);return false;}
  finally{window.clearTimeout(timeout);if(pending.current===controller){pending.current=null;setSaving(null);}}
 }
 return {dismiss,saving,failed,hidden:(job:SkillOperationSummary)=>dismissibleOperationNotice(job)&&(job.notice_dismissed===true||hidden===version(job))};
}
