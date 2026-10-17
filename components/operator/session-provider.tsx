"use client";
import {createContext,useContext,useEffect,useState} from "react";
import {usePathname,useRouter} from "next/navigation";
import {consumeAuthority,resetAuthority,accessChangedEvent,passwordChangeEvent} from "./authority";
import {permissionEvent} from "./use-operator-read";
export type OperatorSession={display_name?:string;local_password?:boolean;auth_method?:"local"|"oidc";sign_in?:{method:"local"|"oidc";provider_label:string|null};login:string;role:"admin"|"user";password_change_required:boolean;access:{account_id:string;revision:string}};
const SessionContext=createContext<OperatorSession|null>(null);
export function OperatorSessionBoundary({children}:{children:React.ReactNode}){
 const path=usePathname(),router=useRouter(),[session,setSession]=useState<OperatorSession|null>(null),[generation,setGeneration]=useState(0);
 useEffect(()=>{
  if(!path.startsWith('/dashboard')&&!path.startsWith('/fleet/')&&!path.startsWith('/history')&&!path.startsWith('/settings')&&!path.startsWith('/skills')&&!path.startsWith('/account')){resetAuthority();return;}
  const controller=new AbortController();let busy=false;
  async function load(){if(busy||document.hidden)return;busy=true;try{const response=await fetch('/api/v1/operator/session',{credentials:'same-origin',cache:'no-store',signal:controller.signal});
   if(response.status===401){setSession(null);document.dispatchEvent(new Event(permissionEvent));router.replace('/login');return;}
   if(!response.ok)return;const value=await response.json();if(!['admin','user'].includes(value.role)||typeof value.login!=='string'||typeof value.password_change_required!=='boolean')return;
   consumeAuthority(value);if(controller.signal.aborted)return;setSession(value);
   if(value.password_change_required&&path!=='/account/password')router.replace('/account/password');
  }catch{/* Keep the last session only on a transient transport failure. */}finally{busy=false;}}
  const changed=()=>{setGeneration(n=>n+1);void load();},visible=()=>{if(!document.hidden)void load();};
  const lost=()=>{setSession(null);setGeneration(n=>n+1);router.replace('/login');};
  const required=()=>router.replace('/account/password');
  document.addEventListener(passwordChangeEvent,required);document.addEventListener(permissionEvent,lost);document.addEventListener(accessChangedEvent,changed);document.addEventListener('visibilitychange',visible);window.addEventListener('focus',visible);
  const timer=window.setTimeout(()=>void load(),0),interval=window.setInterval(()=>void load(),30000);
  return()=>{controller.abort();window.clearTimeout(timer);window.clearInterval(interval);document.removeEventListener(passwordChangeEvent,required);document.removeEventListener(permissionEvent,lost);document.removeEventListener(accessChangedEvent,changed);document.removeEventListener('visibilitychange',visible);window.removeEventListener('focus',visible);};
 },[path,router]);
 return <SessionContext.Provider value={session}><div key={generation}>{children}</div></SessionContext.Provider>;
}
export function useOperatorSession(){return useContext(SessionContext);}
export function useIsAdmin(){return useOperatorSession()?.role==='admin';}
