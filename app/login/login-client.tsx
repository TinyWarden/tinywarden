"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/logo";
import { WardenAvatar } from "@/components/brand/avatar";
import {text} from "@/components/operator/format";
import {PlaybookIcon} from "@/components/playbook/skill";
import { useRouter, useSearchParams } from "next/navigation";
import { PlaybookButton } from "@/components/playbook/controls";
import { messages } from "@/i18n/messages";

export default function LoginClient() {
  const router = useRouter(),query=useSearchParams();
  const [mailEnabled,setMailEnabled]=useState<boolean|null>(null);
  const [provider,setProvider]=useState<{id:string;label:string}|null>(null);
  useEffect(()=>{const c=new AbortController();
    void fetch('/api/v1/operator/email/options',{cache:'no-store',signal:c.signal})
      .then(async r=>{const enabled=r.ok&&(await r.json()).enabled===true;if(!c.signal.aborted)setMailEnabled(enabled);})
      .catch(()=>{if(!c.signal.aborted)setMailEnabled(false);});
    void fetch('/api/v1/operator/oidc/options',{cache:'no-store',signal:c.signal}).then(async r=>{if(r.ok){const v=await r.json();if(!c.signal.aborted)setProvider(v.provider);}}).catch(()=>{});
    return()=>c.abort();
  },[]);
  async function providerLogin(){if(pending)return;setPending(true);setError('');try{
   const r=await fetch('/api/v1/operator/oidc/start',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json','X-TinyWarden-Request':'1'},body:JSON.stringify({schema_version:1,intent:'login'})});
   if(!r.ok)throw new Error('oidc_start');const v=await r.json();window.location.assign(v.url);
  }catch{setError(messages.oidc.unavailable);setPending(false);}}
  const [login,setLogin]=useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/v1/operator/login", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json", "X-TinyWarden-Request": "1" },
        body: JSON.stringify({ schema_version: 1, login, password }),
      });
      if (response.ok) { router.push("/dashboard"); router.refresh(); return; }
      const body = await response.json();
      const code = body?.error?.code;
      setError(code === "rate_limited" ? messages.login.limited
        : code === "setup_required" ? messages.login.setup
        : response.status === 401 ? messages.login.invalid : messages.login.unavailable);
    } catch { setError(messages.login.unavailable); }
    finally { setPending(false); setPassword(""); setShowPassword(false); }
  }

  return (
    <main id="main" tabIndex={-1} className="tw-app tw-ui tw-login">
      <section className="tw-login-brand" aria-label={messages.home.brand}>
        <Link href="/login" className="tw-logo-link" aria-label={messages.home.brand}>
          <BrandLogo ground="ink" />
        </Link>
        <div className="tw-login-story">
          <WardenAvatar className="tw-login-warden" aria-hidden="true" />
          <p className="tw-login-headline">{messages.login.headline}</p>
          <p className="tw-login-description">{messages.login.description}</p>
        </div>
      </section>
      <section className="tw-login-main" aria-labelledby="login-title">
        <div className="tw-login-content">
          <form onSubmit={(event) => { void submit(event); }} className="tw-login-card" aria-busy={pending}>
            <header className="tw-login-card-header">
              <p className="tw-meta">{messages.login.accessLabel}</p>
              <h1 id="login-title">{messages.login.title}</h1>
            </header>
            <div className="tw-login-fields">
              {provider?<p className="tw-t-secondary">{messages.oidc.loginFallback}</p>:null}
              {query.get('oidc')==='failed'?<p role="alert" className="tw-login-error">{messages.oidc.signInFailed}</p>:null}
              {error ? <p id="login-error" role="alert" className="tw-login-error">{error}</p> : null}
              <div className="tw-login-field">
                <label htmlFor="login">{messages.login.loginLabel}</label>
                <input className="tw-input" id="login" name="username" value={login} onChange={event=>setLogin(event.target.value)} required disabled={pending} autoComplete="username" />
              </div>
              <div className="tw-login-field">
                <label htmlFor="password">{messages.login.passwordLabel}</label>
                <div className="tw-login-password">
                  <input className="tw-input" id="password" name="password" type={showPassword ? "text" : "password"}
                    autoComplete="current-password" required disabled={pending}
                    aria-invalid={error === messages.login.invalid} aria-describedby={error ? "login-error" : undefined}
                    value={password} onChange={(event) => setPassword(event.target.value)} />
                  <button type="button" className="tw-textbtn tw-login-toggle" disabled={pending}
                    aria-controls="password" aria-pressed={showPassword}
                    aria-label={showPassword ? messages.login.hidePassword : messages.login.showPassword}
                    onClick={() => setShowPassword((value) => !value)}>
                    {showPassword ? messages.login.hide : messages.login.show}
                  </button>
                </div>
              </div>
              <PlaybookButton type="submit" disabled={pending}>
                {pending ? messages.login.working : messages.login.submit}
              </PlaybookButton>
              {provider?<PlaybookButton variant="secondary" disabled={pending} onClick={()=>void providerLogin()}><PlaybookIcon name="link"/>{text(messages.oidc.signInWith,{provider:provider.label})}</PlaybookButton>:null}
            </div>
          </form>
          <p className="tw-login-help">
            {mailEnabled===null?null:mailEnabled
              ?<Link className="tw-textbtn" href="/forgot-password">{messages.accountEmail.forgotTitle}</Link>
              :messages.login.passwordHelp}
          </p>
        </div>
      </section>
    </main>
  );
}
