"use client";
import {useEffect,useState} from "react";
import {useSearchParams,useRouter} from "next/navigation";
import {messages} from "@/i18n/messages";
import {text} from "@/components/operator/format";
import {SettingsShell} from "../settings-shell";
import {consumeAuthority} from "@/components/operator/authority";
import {permissionEvent} from "@/components/operator/use-operator-read";
import {useOperatorSession} from "@/components/operator/session-provider";
import {SettingsDialog,Disclosure} from "@/components/playbook/skill";
import {PlaybookButton} from "@/components/playbook/controls";
import {CardPagination,Pagination} from "@/components/playbook/pagination";
const t=messages.access,root='/api/v1/operator/access/';
type Entity='users'|'groups';
type Account={id:string;login:string;role:'admin'|'user';disabled:boolean;groups:number;servers:number};
type Group={id:string;name:string;users:number;servers:number};
type Entry=Account|Group;
type Choice={id:string;label:string;selected:boolean;inherited:string[]};
type View<T>={schema_version:1;revision:string;items:T[];total:number;page:number;page_size:50};
type Delta=Map<string,boolean>;
const name=(entry:Entry)=>'login' in entry?entry.login:entry.name;
function useAccessRead<T>(url:string){
 const [received,setReceived]=useState<{url:string;view:View<T>}|null>(null),[failedAt,setFailedAt]=useState(''),[tick,setTick]=useState(0);
 useEffect(()=>{const controller=new AbortController();let disposed=false;const timeout=window.setTimeout(()=>controller.abort(),15000);
  async function load(){try{const r=await fetch(url,{credentials:'same-origin',cache:'no-store',signal:controller.signal});
   if(r.status===401){document.dispatchEvent(new Event(permissionEvent));return;}if(!r.ok)throw new Error('access_unavailable');const v=await r.json();consumeAuthority(v);
   if(v.schema_version!==1||typeof v.revision!=='string'||!Array.isArray(v.items)||v.items.length>50||v.page_size!==50||!Number.isSafeInteger(v.total))throw new Error('access_invalid');
   if(!disposed){setReceived({url,view:v});setFailedAt('');}
  }catch{if(!disposed){setReceived(null);setFailedAt(url);}}finally{window.clearTimeout(timeout);}}
  void load();return()=>{disposed=true;controller.abort();window.clearTimeout(timeout);};
 },[url,tick]);return {view:received?.url===url?received.view:null,failed:failedAt===url,reload:()=>{setReceived(null);setFailedAt('');setTick(n=>n+1);}};
}
function useAccessCommand(){
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[uncertain,setUncertain]=useState(false);
 async function send(url:string,body:Record<string,unknown>){if(busy||uncertain)return false;setBusy(true);setNotice('');const controller=new AbortController(),timeout=window.setTimeout(()=>controller.abort(),15000);
  try{const r=await fetch(url,{method:'POST',credentials:'same-origin',signal:controller.signal,headers:{'Content-Type':'application/json','X-TinyWarden-Request':'1'},body:JSON.stringify({schema_version:1,...body})});
   if(r.status===401){document.dispatchEvent(new Event(permissionEvent));return false;}if(r.ok)return true;
   if(r.status>=500){setUncertain(true);setNotice(t.uncertain);}else {const problem=await r.json().catch(()=>null);setNotice(problem?.error?.code==='last_admin'?t.lastAdmin:problem?.error?.code==='self_access_change'?t.selfHelp:r.status===409?t.conflict:t.invalid);}return false;
  }catch{setUncertain(true);setNotice(t.uncertain);return false;}finally{window.clearTimeout(timeout);setBusy(false);}}
 return {send,busy,notice,uncertain};
}
export function AccessClient(){
 const query=useSearchParams(),router=useRouter(),entity:Entity=query.get('tab')==='groups'?'groups':'users';
 return <SettingsShell active="access"><section className="tw-card" aria-labelledby="access-title"><header className="tw-card__head"><div className="tw-card__titles"><h2 id="access-title" className="tw-t-card">{t.title}</h2><p>{t.help}</p></div>
 <div className="tw-seg" role="tablist" aria-label={t.title}>{(['users','groups'] as const).map(key=><button type="button" className="tw-seg__opt" role="tab" key={key} aria-selected={entity===key} aria-pressed={entity===key} onClick={()=>router.replace('/settings/access?tab='+key,{scroll:false})}>{t[key]}</button>)}</div></header>
 <EntityList key={entity} entity={entity}/></section></SettingsShell>;
}
function EntityList({entity}:{entity:Entity}){
 const [search,setSearch]=useState(''),[page,setPage]=useState(1),[edit,setEdit]=useState<Entry|null>(null),[create,setCreate]=useState(false),read=useAccessRead<Entry>(root+entity+'?'+new URLSearchParams({search,page:String(page)})),v=read.view;
 return <><header className="tw-card__head tw-access-toolbar"><div className="tw-search tw-search--plain"><input type="search" maxLength={100} aria-label={t.search} placeholder={t.search} value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></div><PlaybookButton disabled={!v} onClick={()=>setCreate(true)}>{entity==='users'?t.addUser:t.addGroup}</PlaybookButton></header>
 <div className="tw-table-scroll"><table className="tw-table tw-table--comfortable tw-table--stack tw-access-table">
 <colgroup><col/>{entity==='users'?<><col className="tw-access-role"/><col className="tw-access-state"/><col className="tw-access-count"/></>:<col className="tw-access-count"/>}<col className="tw-access-servers"/><col className="tw-access-action"/></colgroup>
 <thead><tr><th scope="col">{entity==='users'?t.login:t.name}</th>{entity==='users'?<><th scope="col">{t.role}</th><th scope="col">{t.state}</th><th scope="col" className="tw-num">{t.groups}</th></>:<th scope="col" className="tw-num">{t.members}</th>}<th scope="col" className="tw-num">{t.directServers}</th><th scope="col"><span className="tw-sr">{t.edit}</span></th></tr></thead>
 <tbody>{v?.items.map(row=><tr key={row.id}><td><strong className="tw-cell-entity">{name(row)}</strong></td>{'login' in row?<><td className="tw-cell-text" data-label={t.role}>{t[row.role]}</td><td className="tw-cell-text" data-label={t.state}>{row.disabled?t.disabled:t.enabled}</td><td className="tw-cell-num" data-label={t.groups}>{row.groups}</td></>:<td className="tw-cell-num" data-label={t.members}>{row.users}</td>}<td className="tw-cell-num" data-label={t.directServers}>{row.servers}</td><td className="tw-access-action"><PlaybookButton variant="secondary" className="tw-btn--sm" onClick={()=>setEdit(row)}>{t.edit}</PlaybookButton></td></tr>)}
 {read.failed||!v||!v.items.length?<tr className="tw-table__state"><td className="tw-table__empty" colSpan={entity==='users'?6:4}>{read.failed?<><p role="alert">{t.failed}</p><PlaybookButton onClick={read.reload}>{t.reload}</PlaybookButton></>:!v?<p role="status">{t.loading}</p>:t.empty}</td></tr>:null}
 </tbody></table></div>
 {v?<CardPagination page={page} total={v.total} count={v.items.length} pageSize={50} itemLabel={v.total===1?t.ofItem:t.ofItems} loading={false} onPage={setPage}/>:null}
 {create&&v?<CreateDialog entity={entity} revision={v.revision} close={()=>setCreate(false)} saved={()=>{setCreate(false);read.reload();}} inspect={row=>{setCreate(false);setEdit(row);read.reload();}}/>:null}
 {edit?<EditDialog entity={entity} entry={edit} close={()=>setEdit(null)} saved={()=>{setEdit(null);read.reload();}}/>:null}</>;
}
function CreateDialog({entity,revision,close,saved,inspect}:{entity:Entity;revision:string;close:()=>void;saved:()=>void;inspect:(entry:Entry)=>void}){
 const [id]=useState(()=>crypto.randomUUID()),[label,setLabel]=useState(''),[password,setPassword]=useState(''),[role,setRole]=useState<'admin'|'user'>('user'),command=useAccessCommand();
 async function check(){try{const r=await fetch(root+entity+'/'+id,{cache:'no-store',credentials:'same-origin'});if(!r.ok)return;const v=await r.json();consumeAuthority(v);if(v.items?.[0])inspect(v.items[0]);}catch{/* An unconfirmed create is inspected, never automatically repeated. */}}
 return <SettingsDialog title={entity==='users'?t.addUser:t.addGroup} help={entity==='users'?t.newUserHelp:t.newGroupHelp} meta={t.title} locked={command.busy} close={close}>
 <form onSubmit={e=>{e.preventDefault();void (async()=>{if(await command.send(root+entity,{expected_revision:revision,id,...(entity==='users'?{login:label,password,role}:{name:label})}))saved();})();}}>
 <div className="tw-dialog__body tw-access-form"><label className="tw-field"><span className="tw-field__label">{entity==='users'?t.login:t.name}</span><input className="tw-input" required maxLength={64} value={label} disabled={command.busy||command.uncertain} autoComplete="off" onChange={e=>setLabel(e.target.value)}/></label>
 {entity==='users'?<><label className="tw-field"><span className="tw-field__label">{t.role}</span><span className="tw-select"><select value={role} disabled={command.busy||command.uncertain} onChange={e=>setRole(e.target.value as typeof role)}><option value="user">{t.user}</option><option value="admin">{t.admin}</option></select></span></label><label className="tw-field"><span className="tw-field__label">{t.password}</span><input className="tw-input" required type="password" minLength={15} maxLength={128} value={password} disabled={command.busy||command.uncertain} autoComplete="new-password" onChange={e=>setPassword(e.target.value)}/></label></>:null}
 {command.notice?<p role="alert">{command.notice}</p>:null}</div><footer className="tw-dialog__foot"><PlaybookButton variant="secondary" disabled={command.busy} onClick={close}>{t.close}</PlaybookButton>{command.uncertain?<PlaybookButton onClick={()=>void check()}>{t.reload}</PlaybookButton>:<PlaybookButton type="submit" disabled={command.busy}>{t.save}</PlaybookButton>}</footer></form></SettingsDialog>;
}
function EditDialog({entity,entry,close,saved}:{entity:Entity;entry:Entry;close:()=>void;saved:()=>void}){
 const read=useAccessRead<Entry>(root+entity+'/'+entry.id),v=read.view,command=useAccessCommand();
 return <SettingsDialog title={name(entry)} help={t.grantsHelp} meta={t.title} locked={command.busy} close={close}>{v?<EditDraft key={v.revision} entity={entity} entry={v.items[0]!} revision={v.revision} close={close} saved={saved} reload={read.reload} command={command}/>:<div className="tw-dialog__body"><p role={read.failed?'alert':'status'}>{read.failed?t.failed:t.loading}</p>{read.failed?<PlaybookButton onClick={read.reload}>{t.reload}</PlaybookButton>:null}</div>}</SettingsDialog>;
}
function EditDraft({entity,entry,revision,close,saved,reload,command}:{entity:Entity;entry:Entry;revision:string;close:()=>void;saved:()=>void;reload:()=>void;command:ReturnType<typeof useAccessCommand>}){
 const session=useOperatorSession(),account='login' in entry?entry:null,group='name' in entry?entry:null;
 const [label,setLabel]=useState(name(entry)),[role,setRole]=useState(account?.role??'user'),[disabled,setDisabled]=useState(account?.disabled??false),[hosts,setHosts]=useState<Delta>(new Map()),[members,setMembers]=useState<Delta>(new Map()),[reset,setReset]=useState(false),[password,setPassword]=useState(''),[deleting,setDeleting]=useState(false);
 const locked=command.busy||command.uncertain,ownAccount=account?.id===session?.access.account_id;
 const delta=(values:Delta,key:string)=>({['add_'+key]:[...values].filter(([,on])=>on).map(([id])=>id),['remove_'+key]:[...values].filter(([,on])=>!on).map(([id])=>id)});
 async function save(){const action=reset?'/password':deleting?'/delete':'';const body=reset?{password}:deleting?{}:{...(account?{role,disabled}:{name:label}),...delta(hosts,'hosts'),...delta(members,account?'groups':'members')};if(await command.send(root+entity+'/'+entry.id+action,{expected_revision:revision,...body}))saved();}
 return <form onSubmit={e=>{e.preventDefault();void save();}}><div className="tw-dialog__body tw-access-form">
 {deleting?<p>{t.deleteHelp}</p>:reset?<><p>{t.resetHelp}</p><label className="tw-field"><span className="tw-field__label">{t.password}</span><input className="tw-input" type="password" required minLength={15} maxLength={128} value={password} disabled={locked} autoComplete="new-password" onChange={e=>setPassword(e.target.value)}/></label></>:<>
 {account?<><label className="tw-field"><span className="tw-field__label">{t.role}</span><span className="tw-select"><select value={role} disabled={locked||!!ownAccount} onChange={e=>setRole(e.target.value as typeof role)}><option value="user">{t.user}</option><option value="admin">{t.admin}</option></select></span></label><label className="tw-check"><input type="checkbox" checked={!disabled} disabled={locked||!!ownAccount} onChange={e=>setDisabled(!e.target.checked)}/>{t.enabled}</label>{ownAccount?<p className="tw-field__note">{t.selfHelp}</p>:null}{role==='admin'?<p>{t.adminHelp}</p>:null}</>:<label className="tw-field"><span className="tw-field__label">{t.name}</span><input className="tw-input" required maxLength={64} value={label} disabled={locked} onChange={e=>setLabel(e.target.value)}/></label>}
 <div className="tw-card"><Disclosure title={account?t.directServers:t.servers} initialOpen><Choices entity={entity} target={entry.id} kind="hosts" revision={revision} delta={hosts} change={setHosts} disabled={locked}/></Disclosure><Disclosure title={account?t.groups:t.members} initialOpen><Choices entity={entity} target={entry.id} kind={account?'groups':'users'} revision={revision} delta={members} change={setMembers} disabled={locked}/></Disclosure></div>
 {account&&account.id!==session?.access.account_id?<PlaybookButton variant="secondary" disabled={locked} onClick={()=>setReset(true)}>{t.resetPassword}</PlaybookButton>:null}{group?<PlaybookButton variant="secondary" disabled={locked} onClick={()=>setDeleting(true)}>{t.delete}</PlaybookButton>:null}</>}
 {command.notice?<p role="alert">{command.notice}</p>:null}</div><footer className="tw-dialog__foot"><PlaybookButton variant="secondary" disabled={command.busy} onClick={close}>{t.close}</PlaybookButton>{command.uncertain||command.notice===t.conflict?<PlaybookButton disabled={command.busy} onClick={reload}>{t.reload}</PlaybookButton>:<PlaybookButton type="submit" disabled={locked}>{deleting?t.confirmDelete:t.save}</PlaybookButton>}</footer></form>;
}
function Choices({entity,target,kind,revision,delta,change,disabled}:{entity:Entity;target:string;kind:'hosts'|'users'|'groups';revision:string;delta:Delta;change:(value:Delta)=>void;disabled:boolean}){
 const [search,setSearch]=useState(''),[page,setPage]=useState(1),read=useAccessRead<Choice>(root+entity+'/'+target+'/choices/'+kind+'?'+new URLSearchParams({search,page:String(page)})),v=read.view;
 const adds=[...delta.values()].filter(Boolean).length,removes=delta.size-adds;
 return <div className="tw-access-choices"><div className="tw-search tw-search--plain"><input type="search" aria-label={t.search} placeholder={t.search} maxLength={100} value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></div>
 {v&&v.revision!==revision?<p role="alert">{t.conflict}</p>:v?<><div className="tw-access-options">{v.items.map(row=><label className="tw-check" key={row.id}><input type="checkbox" checked={delta.get(row.id)??row.selected} disabled={disabled||!delta.has(row.id)&&(row.selected?removes:adds)>=256} onChange={e=>{const next=new Map(delta);if(e.target.checked===row.selected)next.delete(row.id);else next.set(row.id,e.target.checked);change(next);}}/><span>{row.label}{row.inherited.length?<small className="tw-access-subtext">{text(t.inherited,{groups:row.inherited.join(', ')})}</small>:null}</span></label>)}</div>{!v.items.length?<p>{t.noChoices}</p>:null}<Pagination page={page} count={v.items.length} total={v.total} pageSize={50} itemLabel={v.total===1?t.ofItem:t.ofItems} loading={false} onPage={setPage}/></>:<p role={read.failed?'alert':'status'}>{read.failed?t.failed:t.loading}</p>}
 {adds>=256||removes>=256?<p>{t.selectionLimit}</p>:null}</div>;
}
