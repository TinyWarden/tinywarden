"use client";
import{useRef,useState}from"react";
import{messages}from"@/i18n/messages";
import{time}from"@/components/operator/format";
import{permissionEvent}from"@/components/operator/use-operator-read";
import{SkillSettingsButton}from"@/components/playbook/skill";
import{PlaybookButton}from"@/components/playbook/controls";
import type{PackageResults}from"./package-model";
const t=messages.manualRuns;
export function PackageRunNow({host,skill,outdated,saved,onSettings}:{host:string;skill:PackageResults["skills"][number];outdated:boolean;saved:()=>Promise<unknown>;onSettings:()=>void}){
  const [sending,setSending]=useState(false),[error,setError]=useState<string|null>(null),lock=useRef(false);
  const [previous,setPrevious]=useState<string|null>(null);
  const manual=skill.manual_run,latest=manual.latest,pending=latest?.phase==="queued"||latest?.phase==="running";
  const reason=outdated?"reading_unavailable":manual.unavailable_reason;
  const storageKey=`tinywarden:manual-run:v1:${host}:${skill.installation_id}`;
  async function run(){
    if(lock.current)return;lock.current=true;setPrevious(latest?.id??null);setSending(true);setError(null);
    try{
      let input:{schema_version:1;request_id:string;expected_context:string};
      const old=sessionStorage.getItem(storageKey);
      if(old){input=JSON.parse(old);if(input.schema_version!==1||typeof input.request_id!=="string"||typeof input.expected_context!=="string")throw Error("invalid_saved_request");}
      else{input={schema_version:1,request_id:crypto.randomUUID(),expected_context:manual.expected_context!};sessionStorage.setItem(storageKey,JSON.stringify(input));}
      const controller=new AbortController(),timeout=window.setTimeout(()=>controller.abort(),15000);
      try{const response=await fetch(`/api/v2/operator/hosts/${host}/skills/${skill.installation_id}/run`,{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json","X-TinyWarden-Request":"1"},body:JSON.stringify(input),signal:controller.signal});
        if(response.status===401){document.dispatchEvent(new Event(permissionEvent));return;}
        if(response.ok){const body=await response.json();if(body.schema_version!==1||!body.result?.id)throw Error("invalid_response");sessionStorage.removeItem(storageKey);await saved();}
        else if(response.status>=400&&response.status<500){sessionStorage.removeItem(storageKey);const body=await response.json();setError((t.reasons as Record<string,string>)[body.error?.code??body.error]??t.requestRejected);await saved();}
        else throw Error("request_uncertain");
      }finally{window.clearTimeout(timeout);}
    }catch{setError(t.requestUncertain);await saved();}finally{lock.current=false;setSending(false);}
  }
  return <><div className="tw-skill__buttons"><PlaybookButton type="button" variant="secondary" className="tw-btn--sm tw-runnow" aria-busy={sending} disabled={sending||pending||!!reason||!manual.expected_context} onClick={()=>void run()} title={reason?(t.reasons as Record<string,string>)[reason]:t.help}>
    <svg className="tw-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m8 5 11 7-11 7Z"/></svg>{sending?t.requesting:t.action}</PlaybookButton><SkillSettingsButton onClick={onSettings}/></div>
    <span className={`tw-skill__actionstate${error||latest?.phase==="failed"?" tw-skill__actionstate--failed":""}`} role="status" aria-live="polite">{(error&&(!latest||latest.id===previous)?error:null)??(latest?latest.phase==="completed"?"":`${t.phases[latest.phase]}${latest.completed_at?messages.dashboard.separator+time(latest.completed_at):""}${latest.reason&&latest.phase==="failed"?messages.dashboard.separator+((t.reasons as Record<string,string>)[latest.reason]??t.runFailed):""}`:reason?(t.reasons as Record<string,string>)[reason]:"")}</span>
  </>;
}
