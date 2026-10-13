"use client";
import {PageHeader} from "@/components/playbook/page";
import {useState} from "react";
import {useRouter} from "next/navigation";
import Link from "next/link";
import {messages} from "@/i18n/messages";
import {OperatorShell} from "@/components/operator/shell";
import {useOperatorSession} from "@/components/operator/session-provider";
import {PlaybookButton} from "@/components/playbook/controls";
const t=messages.access;
export function PasswordClient(){
 const router=useRouter(),session=useOperatorSession(),[current,setCurrent]=useState(''),[next,setNext]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[done,setDone]=useState(false),[uncertain,setUncertain]=useState(false);
 async function save(){if(busy)return;if(next!==confirm){setNotice(t.passwordMismatch);return;}setBusy(true);setNotice('');const controller=new AbortController(),timeout=window.setTimeout(()=>controller.abort(),15000);
  try{const r=await fetch('/api/v1/operator/password',{method:'POST',credentials:'same-origin',signal:controller.signal,headers:{'Content-Type':'application/json','X-TinyWarden-Request':'1'},body:JSON.stringify({schema_version:1,current_password:current,new_password:next})});
   if(r.status===204){setDone(true);setCurrent('');setNext('');setConfirm('');}else if(r.status===401){router.replace('/login');}else if(r.status>=500){setUncertain(true);setNotice(t.passwordUncertain);}else setNotice(t.passwordInvalid);
  }catch{setUncertain(true);setNotice(t.passwordUncertain);}finally{window.clearTimeout(timeout);setBusy(false);}}
 return <OperatorShell active="settings"><main id="main" tabIndex={-1} className="tw-ui tw-main"><PageHeader title={t.changePassword} description={t.passwordHelp}/>
 <section className="tw-card"><div className="tw-card__body">{done?<><p role="status">{t.passwordSaved}</p><Link className="tw-btn" href="/login">{messages.fleet.signIn}</Link></>:<form className="tw-access-form" onSubmit={e=>{e.preventDefault();void save();}}>
 {session?.password_change_required?<p role="status">{t.requiredPassword}</p>:null}
 <label className="tw-field"><span className="tw-field__label">{t.currentPassword}</span><input className="tw-input" type="password" required autoComplete="current-password" maxLength={1024} disabled={busy||uncertain} value={current} onChange={e=>setCurrent(e.target.value)}/></label>
 <label className="tw-field"><span className="tw-field__label">{t.newPassword}</span><input className="tw-input" type="password" required minLength={15} maxLength={128} autoComplete="new-password" disabled={busy||uncertain} value={next} onChange={e=>setNext(e.target.value)}/></label>
 <label className="tw-field"><span className="tw-field__label">{t.confirmPassword}</span><input className="tw-input" type="password" required minLength={15} maxLength={128} autoComplete="new-password" disabled={busy||uncertain} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
 {notice?<p role="alert">{notice}</p>:null}{uncertain?<Link className="tw-btn" href="/login">{messages.fleet.signIn}</Link>:<PlaybookButton type="submit" disabled={busy}>{t.save}</PlaybookButton>}</form>}</div></section></main></OperatorShell>;
}
