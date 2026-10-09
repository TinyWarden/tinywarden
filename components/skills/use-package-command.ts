"use client";
import { useEffect, useRef, useState } from "react";
import { permissionEvent } from "@/components/operator/use-operator-read";
import { messages } from "@/i18n/messages";
import type { PackageFieldError } from "@/lib/skills/package-types";
const t = messages.packageSkills;
export function usePackageCommand() {
  const pending = useRef<{ url: string; body: string | File; headers: Record<string,string> } | null>(null), controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [notice, setNotice] = useState("");
  const [errors, setErrors] = useState<PackageFieldError[]>([]);
  useEffect(()=>{
    if(!busy && !uncertain)return;
    const leave=(event:Event)=>event.preventDefault();
    const click=(event:MouseEvent)=>{if(event.target instanceof Element && event.target.closest("a[href]")){event.preventDefault();event.stopPropagation();}};
    window.addEventListener("beforeunload",leave);document.addEventListener("tinywarden:before-leave",leave);document.addEventListener("click",click,true);
    return()=>{window.removeEventListener("beforeunload",leave);document.removeEventListener("tinywarden:before-leave",leave);document.removeEventListener("click",click,true);};
  },[busy,uncertain]);
  useEffect(() => {
    const clear = () => { controller.current?.abort(); pending.current = null; setNotice(""); setErrors([]); };
    document.addEventListener(permissionEvent, clear);
    return () => { document.removeEventListener(permissionEvent, clear); controller.current?.abort(); };
  }, []);
  async function send(url: string, body: Record<string, unknown>, saved: () => Promise<unknown>) {
    return execute({url,body:JSON.stringify({schema_version:1,request_id:crypto.randomUUID(),...body}),headers:{"Content-Type":"application/json","X-TinyWarden-Request":"1"}},saved);
  }
  async function upload(file:File,saved:()=>Promise<unknown>,uploaded?:(value:unknown)=>void){
    return execute({url:"/api/v2/operator/skills/upload",body:file,headers:{"Content-Type":"application/zip","X-TinyWarden-Request":"1","X-TinyWarden-Upload-ID":crypto.randomUUID()}},saved,uploaded);
  }
  async function execute(input:NonNullable<typeof pending.current>,saved:()=>Promise<unknown>,completed?:(value:unknown)=>void) {
    if (controller.current) return false;
    const request = pending.current ?? input;
    pending.current = request;
    const active = new AbortController(); controller.current = active; setBusy(true); setErrors([]);
    const timeout = window.setTimeout(() => active.abort(), 15000);
    try {
      const response = await fetch(request.url, { method: "POST", credentials: "same-origin", signal: active.signal,
        headers: request.headers, body: request.body });
      if (response.status === 401) { document.dispatchEvent(new Event(permissionEvent)); return false; }
      const value = await response.json();
      if (active.signal.aborted) throw new Error("aborted");
      if (response.ok) { completed?.(value); pending.current = null; setUncertain(false); setNotice(request.body instanceof File?t.uploaded:t.saved); await saved(); return true; }
      if (response.status >= 500) { setUncertain(true); setNotice(t.uncertain); return false; }
      pending.current = null; setUncertain(false);
      if (response.status === 409) { setNotice(t.conflict); await saved(); }
      else { setNotice(t.invalid); if (Array.isArray(value.error?.field_errors)) setErrors(value.error.field_errors); }
      return false;
    } catch { if (pending.current) { setUncertain(true); setNotice(t.uncertain); } return false; }
    finally { window.clearTimeout(timeout); controller.current = null; setBusy(false); }
  }
  const retry=(saved:()=>Promise<unknown>)=>pending.current?execute(pending.current,saved):Promise.resolve(false);
  return { send, upload, retry, busy, uncertain, notice, errors };
}
