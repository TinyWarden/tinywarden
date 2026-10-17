'use client';
import {useEffect,useState,type ReactNode} from 'react';
import Link from 'next/link';
import {messages} from '@/i18n/messages';
import {BrandLogo} from '@/components/brand/logo';
import {PageHeader} from '@/components/playbook/page';
import {PlaybookButton} from '@/components/playbook/controls';
import {PlaybookIcon} from '@/components/playbook/skill';
import {InlineAlert} from '@/components/playbook/forms';
const t=messages.accountEmail;
export function AccountEmailClient({mode}:{mode:'forgot'|'reset'|'verify'}){
 const [token,setToken]=useState<string|null>(()=>mode==='forgot'||typeof window==='undefined'?null:new URLSearchParams(window.location.hash.slice(1)).get('token')),[ready,setReady]=useState(false),[login,setLogin]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
 const [busy,setBusy]=useState(false),[done,setDone]=useState(false),[notice,setNotice]=useState(''),[invalid,setInvalid]=useState(false),[enabled,setEnabled]=useState<boolean|null>(null);
 useEffect(()=>{
  if(mode!=='forgot'){
   window.history.replaceState(null,'',window.location.pathname);
   // One-time synchronization of a browser-only, sensitive URL with the SSR form.
   // The token is captured during hydration so Strict Mode effect replay cannot lose it.
   // eslint-disable-next-line react-hooks/set-state-in-effect
   setReady(true);return;
  }
  const c=new AbortController();void fetch('/api/v1/operator/email/options',{cache:'no-store',signal:c.signal}).then(async r=>{if(!r.ok)throw new Error('options');const v=await r.json();if(!c.signal.aborted)setEnabled(v.enabled===true);}).catch(()=>{if(!c.signal.aborted)setNotice(t.unavailable);});return()=>c.abort();
 },[mode]);
 async function submit(){
  if(busy||done||invalid)return;if(mode==='reset'&&password!==confirm){setNotice(t.passwordMismatch);return;}setBusy(true);setNotice('');
  const c=new AbortController(),timer=window.setTimeout(()=>c.abort(),15000);
  try{
   const endpoint=mode==='forgot'?'password-recovery/request':mode==='reset'?'password-recovery/reset':'email/verify';
   const body=mode==='forgot'?{login}:mode==='reset'?{token,new_password:password}:{token};
   const r=await fetch('/api/v1/operator/'+endpoint,{method:'POST',credentials:'same-origin',cache:'no-store',signal:c.signal,headers:{'Content-Type':'application/json','X-TinyWarden-Request':'1'},body:JSON.stringify({schema_version:1,...body})});
   if(r.ok){setDone(true);setToken(null);setPassword('');setConfirm('');return;}
   if(r.status===410){setInvalid(true);setToken(null);setNotice(t.invalidLink);}else setNotice(r.status===429?t.limited:r.status>=500?t.unavailable:t.invalid);
  }catch{setNotice(t.unavailable);}finally{window.clearTimeout(timer);setBusy(false);}
 }
 const title=mode==='forgot'?t.forgotTitle:mode==='reset'?t.resetTitle:t.verifyTitle,help=mode==='forgot'?t.forgotHelp:mode==='reset'?t.resetHelp:t.verifyLandingHelp;
 const unavailable=mode==='forgot'?enabled!==true:!ready||!token||invalid;
 let content:ReactNode=null;
 if(done)content=<InlineAlert title={mode==='forgot'?t.forgotSent:mode==='reset'?t.resetSuccess:t.verified} tone={mode==='forgot'?'info':'success'}/>;
 else if(mode==='forgot'&&enabled===false)content=<InlineAlert title={t.disabled}/>;
 else if(mode!=='forgot'&&ready&&!token)content=<InlineAlert title={invalid?t.invalidLink:t.missingLink} tone={invalid?'critical':'info'}/>;
 else if(mode!=='verify')content=<>
 {mode==='forgot'?<label className="tw-field"><span className="tw-field__label">{messages.access.login}</span><input className="tw-input" name="username" autoComplete="username" minLength={1} maxLength={64} required disabled={busy||unavailable} value={login} onChange={e=>setLogin(e.target.value)}/></label>:null}
 {mode==='reset'?<><label className="tw-field"><span className="tw-field__label">{messages.access.newPassword}</span><input className="tw-input" type="password" autoComplete="new-password" minLength={15} maxLength={128} required disabled={busy||unavailable} value={password} onChange={e=>setPassword(e.target.value)}/></label>
 <label className="tw-field"><span className="tw-field__label">{messages.access.confirmPassword}</span><input className="tw-input" type="password" autoComplete="new-password" minLength={15} maxLength={128} required disabled={busy||unavailable} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label></>:null}
 </>;
 const hasBody=content!==null||!!notice&&!invalid||mode==='forgot',ActionArea=hasBody?'footer':'div';
 return <div className="tw-app"><header className="tw-header"><Link href="/login" className="tw-brand tw-logo-link" aria-label={messages.home.brand}><BrandLogo ground="ink"/></Link></header>
 <main id="main" tabIndex={-1} className="tw-ui tw-main tw-account-email"><PageHeader title={title} description={help}/><section className="tw-card"><form onSubmit={e=>{e.preventDefault();void submit();}} aria-busy={busy}>
 {hasBody?<div className="tw-card__body tw-card__body--pad tw-form-body">{content}{notice&&!invalid?<InlineAlert title={notice} tone="critical"/>:null}{mode==='forgot'?<p className="tw-t-secondary">{t.forgotScope}</p>:null}</div>:null}
 <ActionArea className={hasBody?'tw-card__foot':'tw-card__body tw-card__body--pad'}><div className="tw-btns">
 {!done&&!unavailable?<PlaybookButton type="submit" disabled={busy}><PlaybookIcon name="check"/>{busy?t.working:mode==='forgot'?t.forgotAction:mode==='reset'?t.resetAction:t.verifyConfirm}</PlaybookButton>:null}
 {mode==='verify'&&(invalid||ready&&!token&&!done)?<Link className="tw-btn tw-btn--secondary" href="/account"><PlaybookIcon name="refresh"/>{t.verifyAgain}</Link>:null}
 {mode==='reset'&&(invalid||ready&&!token&&!done)?<Link className="tw-btn tw-btn--secondary" href="/forgot-password"><PlaybookIcon name="refresh"/>{t.resetAgain}</Link>:null}
 <Link className="tw-btn tw-btn--secondary" href="/login"><PlaybookIcon name="link"/>{t.backLogin}</Link>
 </div></ActionArea></form></section></main></div>;
}
