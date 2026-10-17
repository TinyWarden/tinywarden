'use client';
import {useEffect} from 'react';
import {useSearchParams} from 'next/navigation';
import {PageHeader} from '@/components/playbook/page';
import {messages} from '@/i18n/messages';
/** A public same-origin document ends the cross-site redirect chain before
 * reading the Strict application cookie. No credentials are passed in its URL. */
export function CompleteSignInClient(){
 const query=useSearchParams(),intent=query.get('intent');
 useEffect(()=>{const c=new AbortController();void fetch('/api/v1/operator/session',{credentials:'same-origin',cache:'no-store',signal:c.signal}).then(r=>{
  if(c.signal.aborted)return;window.location.replace(r.ok?(intent==='link'?'/account?oidc=linked':'/dashboard'):'/login?oidc=failed');
 }).catch(()=>{if(!c.signal.aborted)window.location.replace('/login?oidc=failed');});return()=>c.abort();},[intent]);
 return <main id="main" tabIndex={-1} className="tw-app tw-ui tw-main"><PageHeader title={messages.oidc.title} description={messages.oidc.completing}/><section className="tw-card"><div className="tw-card__body"><p role="status">{messages.oidc.completing}</p></div></section></main>;
}
