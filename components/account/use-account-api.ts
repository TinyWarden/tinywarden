'use client';
import {useEffect,useState} from 'react';
import {messages} from '@/i18n/messages';
import {consumeAuthority} from '@/components/operator/authority';
import {permissionEvent} from '@/components/operator/use-operator-read';
export function useAccountRead<T>(url:string){
 const [value,setValue]=useState<T|null>(null),[error,setError]=useState(false),[generation,setGeneration]=useState(0);
 useEffect(()=>{const c=new AbortController();let disposed=false;const timer=window.setTimeout(()=>c.abort(),15000);
 void (async()=>{try{const r=await fetch(url,{credentials:'same-origin',cache:'no-store',signal:c.signal});if(r.status===401){document.dispatchEvent(new Event(permissionEvent));return;}if(!r.ok)throw new Error('account_read');const body=await r.json();consumeAuthority(body);if(!disposed){setValue(body);setError(false);}}catch{if(!disposed){setValue(null);setError(true);}}finally{window.clearTimeout(timer);}})();
 return()=>{disposed=true;c.abort();window.clearTimeout(timer);};},[url,generation]);
 return {value,error,reload:()=>{setValue(null);setError(false);setGeneration(n=>n+1);}};
}
export function useAccountCommand(){
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[uncertain,setUncertain]=useState(false);
 async function send<T=unknown>(url:string,body:Record<string,unknown>):Promise<T|null>{
 if(busy||uncertain)return null;setBusy(true);setNotice('');const c=new AbortController(),timer=window.setTimeout(()=>c.abort(),15000);
 try{const r=await fetch(url,{method:'POST',credentials:'same-origin',cache:'no-store',signal:c.signal,headers:{'Content-Type':'application/json','X-TinyWarden-Request':'1'},body:JSON.stringify({schema_version:1,...body})});
 if(r.status===401){document.dispatchEvent(new Event(permissionEvent));return null;}const result=await r.json();if(r.ok){consumeAuthority(result);return result;}
 if(r.status>=500){setUncertain(true);setNotice(messages.account.uncertain);}else{const code=result?.error?.code;setNotice(code==='invalid_password'?messages.accountEmail.wrongPassword:code==='email_recent_sign_in_required'?messages.accountEmail.recentSignIn:code==='rate_limited'?messages.accountEmail.limited:code==='oidc_recent_login_required'?messages.account.recentLogin:code==='local_password_required'?messages.account.localRequired:code==='oidc_secret_required'?messages.oidc.secretRequired:code==='local_admin_required'?messages.oidc.fallbackRequired:code==='oidc_identity_immutable'?messages.oidc.immutable:r.status===409?messages.account.conflict:messages.account.invalid);}return null;
 }catch{setUncertain(true);setNotice(messages.account.uncertain);return null;}finally{window.clearTimeout(timer);setBusy(false);}}
 return {send,busy,notice,uncertain};
}
