"use client";
import {PageHeader} from "@/components/playbook/page";
import {useId,useState} from "react";
import {useRouter} from "next/navigation";
import Link from "next/link";
import {messages} from "@/i18n/messages";
import {OperatorShell} from "@/components/operator/shell";
import {useOperatorSession} from "@/components/operator/session-provider";
import {RequirementList,InlineAlert} from "@/components/playbook/forms";
import {PlaybookIcon} from "@/components/playbook/skill";
import {PlaybookButton} from "@/components/playbook/controls";
const t=messages.access;
export function PasswordClient(){
 const requirements=useId();
 const router=useRouter(),session=useOperatorSession(),[current,setCurrent]=useState(''),[next,setNext]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[done,setDone]=useState(false),[uncertain,setUncertain]=useState(false);
 async function save(){if(busy)return;if(next!==confirm){setNotice(t.passwordMismatch);return;}setBusy(true);setNotice('');const controller=new AbortController(),timeout=window.setTimeout(()=>controller.abort(),15000);
  try{const r=await fetch('/api/v1/operator/password',{method:'POST',credentials:'same-origin',signal:controller.signal,headers:{'Content-Type':'application/json','X-TinyWarden-Request':'1'},body:JSON.stringify({schema_version:1,current_password:current,new_password:next})});
   if(r.status===204){setDone(true);setCurrent('');setNext('');setConfirm('');}else if(r.status===401){router.replace('/login');}else if(r.status>=500){setUncertain(true);setNotice(t.passwordUncertain);}else setNotice(t.passwordInvalid);
  }catch{setUncertain(true);setNotice(t.passwordUncertain);}finally{window.clearTimeout(timeout);setBusy(false);}}
 if(session?.local_password===false)return <OperatorShell active="settings"><main id="main" tabIndex={-1} className="tw-ui tw-main tw-password-page"><PageHeader title={t.changePassword} description={messages.account.signInHelp}/><section className="tw-card"><div className="tw-card__body"><p>{messages.account.localDisabled}</p><Link className="tw-btn tw-btn--secondary" href="/account">{messages.account.title}</Link></div></section></main></OperatorShell>;
 return <OperatorShell active="settings"><main id="main" tabIndex={-1} className="tw-ui tw-main tw-password-page"><PageHeader title={t.changePassword} description={t.passwordHelp}/>
 <section className="tw-card tw-card--action">{done?<><div className="tw-card__body tw-card__body--pad"><InlineAlert title={t.passwordSaved} tone="success"/></div><footer className="tw-card__foot"><Link className="tw-btn" href="/login"><PlaybookIcon name="link"/>{messages.fleet.signIn}</Link></footer></>:<form onSubmit={e=>{e.preventDefault();void save();}}>
 <div className="tw-card__body tw-card__body--pad tw-form-body">{session?.password_change_required?<InlineAlert title={t.requiredPassword}/>:null}
 <div className="tw-fields tw-fields--fit"><label className="tw-field"><span className="tw-field__label">{t.currentPassword}</span><input className="tw-input tw-input--lg" type="password" required autoComplete="current-password" maxLength={1024} disabled={busy||uncertain} value={current} onChange={e=>setCurrent(e.target.value)}/></label>
 <label className="tw-field"><span className="tw-field__label">{t.newPassword}</span><input className="tw-input tw-input--lg" type="password" required minLength={15} maxLength={128} autoComplete="new-password" aria-describedby={requirements} disabled={busy||uncertain} value={next} onChange={e=>setNext(e.target.value)}/></label>
 <label className="tw-field"><span className="tw-field__label">{t.confirmPassword}</span><input className="tw-input tw-input--lg" type="password" required minLength={15} maxLength={128} autoComplete="new-password" aria-describedby={requirements} disabled={busy||uncertain} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label></div>
 <RequirementList id={requirements} items={[{label:messages.uiForms.minimumPassword,met:[...next].length>=15},{label:messages.uiForms.passwordsMatch,met:next.length>0&&next===confirm}]}/>{notice?<p role="alert">{notice}</p>:null}</div>
 <footer className="tw-card__foot">{uncertain?<Link className="tw-btn" href="/login"><PlaybookIcon name="link"/>{messages.fleet.signIn}</Link>:<PlaybookButton type="submit" className="tw-btn--lg" disabled={busy}><PlaybookIcon name="check"/>{t.changePassword}</PlaybookButton>}</footer></form>}</section></main></OperatorShell>;
}
