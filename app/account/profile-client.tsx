'use client';
import {useState} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {messages} from '@/i18n/messages';
import {OperatorShell} from '@/components/operator/shell';
import {PageHeader} from '@/components/playbook/page';
import {PlaybookButton} from '@/components/playbook/controls';
import {PlaybookIcon,SettingsDialog} from '@/components/playbook/skill';
import {InlineAlert} from '@/components/playbook/forms';
import {FactGrid,DetailsGrid} from '@/components/playbook/data';
import {ProfileFields} from '@/components/account/profile-fields';
import {useAccountRead,useAccountCommand} from '@/components/account/use-account-api';
const t=messages.account;
type Profile={id:string;login:string;role:'admin'|'user';display_name:string;email:string|null;email_verified:boolean;revision:string;access_revision:string;local_password:boolean;mail_enabled:boolean;provider:{id:string;label:string}|null;identities:{id:string;label:string;enabled:boolean}[];provider_groups:{name:string;label:string}[]};
export function AccountClient(){
 const [saved,setSaved]=useState(false),read=useAccountRead<{profile:Profile}>('/api/v1/operator/profile'),query=useSearchParams();
 return <OperatorShell active="settings"><main id="main" tabIndex={-1} className="tw-ui tw-main tw-account-page"><PageHeader title={t.title} description={t.help}/>
 {saved?<p className="tw-notice" role="status">{t.saved}</p>:null}
 {query.get('oidc')==='linked'?<p className="tw-notice" role="status">{t.linked}</p>:null}
 {read.value?<ProfileDraft key={read.value.profile.revision} profile={read.value.profile} reload={read.reload} onSaved={()=>setSaved(true)}/>:<section className="tw-card"><div className="tw-card__body"><p role={read.error?'alert':'status'}>{read.error?t.failed:t.loading}</p>{read.error?<PlaybookButton onClick={read.reload}><PlaybookIcon name="refresh"/>{t.reload}</PlaybookButton>:null}</div></section>}
 </main></OperatorShell>;
}
function ProfileDraft({profile,reload,onSaved}:{profile:Profile;reload:()=>void;onSaved:()=>void}){
 const [verify,setVerify]=useState(false),[proof,setProof]=useState(''),[requested,setRequested]=useState(false);
 const [name,setName]=useState(profile.display_name),[email,setEmail]=useState(profile.email??''),[disconnect,setDisconnect]=useState<string|null>(null),command=useAccountCommand();
 const locked=command.busy||command.uncertain,localUsable=profile.local_password&&(!profile.provider||profile.role==='admin');
 async function save(){if(await command.send('/api/v1/operator/profile',{expected_revision:profile.revision,display_name:name,email:email.trim()||null})){onSaved();reload();window.dispatchEvent(new Event('focus'));}}
 async function link(){const r=await command.send<{url:string}>('/api/v1/operator/oidc/start',{intent:'link'});if(r)window.location.assign(r.url);}
 async function sendVerification(){if(await command.send('/api/v1/operator/email/request',{expected_revision:profile.revision,current_password:profile.local_password?proof:null})){setVerify(false);setProof('');setRequested(true);}else setProof('');}
 async function unlink(id:string){if(await command.send('/api/v1/operator/oidc/unlink',{expected_revision:profile.access_revision,identity_id:id})){setDisconnect(null);reload();}}
 const clean=name===profile.display_name&&email===(profile.email??'');
 const alertTitle=!profile.local_password?messages.uiForms.providerRecovery:!profile.mail_enabled?messages.uiForms.recoveryDisabled:profile.email_verified&&email===profile.email?messages.uiForms.recoveryReady:messages.uiForms.recoveryVerify;
 return <div className="tw-cards"><section className="tw-card"><header className="tw-card__head"><div className="tw-card__titles"><h2 className="tw-t-section">{t.profile}</h2></div></header>
 <form onSubmit={e=>{e.preventDefault();void save();}}><FactGrid band="both" facts={[{key:'login',label:messages.access.login,value:profile.login,mono:true},{key:'role',label:messages.access.role,value:messages.access[profile.role]}]}/>
 <div className="tw-card__body tw-card__body--pad tw-form-body"><div className="tw-fields tw-fields--fit"><ProfileFields name={name} email={email} onName={setName} onEmail={setEmail} disabled={locked} nameChanged={name!==profile.display_name} emailChanged={email!==(profile.email??'')}/></div>
 {profile.email&&email===profile.email?<p className="tw-field__note">{profile.email_verified?t.emailVerified:t.emailUnverified}</p>:null}
 {requested?<InlineAlert title={messages.accountEmail.queuedTitle}>{messages.accountEmail.queuedHelp}</InlineAlert>:<InlineAlert title={alertTitle} tone={profile.local_password&&profile.email_verified&&email===profile.email?'success':'info'}>{!profile.local_password?messages.accountEmail.ssoRecovery:!profile.mail_enabled?messages.accountEmail.disabled:profile.email_verified&&email===profile.email?messages.accountEmail.ready:t.emailRecoveryHelp}</InlineAlert>}
 {profile.email&&!profile.email_verified?<><PlaybookButton type="button" variant="secondary" disabled={locked||!profile.mail_enabled||requested||email!==profile.email} onClick={()=>setVerify(true)}><PlaybookIcon name="check"/>{messages.accountEmail.verifyTitle}</PlaybookButton>{email!==profile.email?<p className="tw-field__note">{messages.accountEmail.saveFirst}</p>:null}</>:null}
 {command.notice?<p role="alert">{command.notice}</p>:null}</div>
 <footer className="tw-card__foot">{command.uncertain?<PlaybookButton type="button" variant="secondary" onClick={reload}><PlaybookIcon name="refresh"/>{t.reload}</PlaybookButton>:<PlaybookButton type="submit" disabled={locked||clean}><PlaybookIcon name="check"/>{t.save}</PlaybookButton>}</footer></form></section>
 <section className="tw-card"><header className="tw-card__head"><div className="tw-card__titles"><h2 className="tw-t-section">{t.signIn}</h2><p className="tw-t-secondary">{t.signInHelp}</p></div></header>
 <FactGrid band="top" facts={[{key:'local',label:t.localPassword,value:localUsable?t.localEnabled:profile.local_password?messages.oidc.localBlocked:t.localDisabled},...(profile.identities.length?profile.identities.map(i=>({key:i.id,label:i.label,value:i.enabled?t.connected:t.providerDisabled})):[{key:'provider',label:messages.oidc.provider,value:profile.provider?.label??messages.uiForms.noIdentityProvider,muted:!profile.provider}])]}/>
 {!profile.identities.length&&profile.provider?<div className="tw-card__body tw-card__body--pad"><p className="tw-t-secondary">{t.linkHelp}</p></div>:null}
 {profile.provider_groups.length?<div className="tw-card__body tw-card__body--pad tw-form-body"><h3 className="tw-t-head">{t.providerGroups}</h3><p className="tw-t-secondary">{t.providerGroupsHelp}</p><DetailsGrid facts={profile.provider_groups.map((g,i)=>({key:String(i),label:g.name,value:g.label}))}/></div>:null}
 {profile.local_password||profile.identities.length||profile.provider?<footer className="tw-card__foot"><div className="tw-btns">
 {profile.local_password?<Link className="tw-btn tw-btn--secondary tw-btn--sm" href="/account/password"><PlaybookIcon name="settings"/>{messages.access.changePassword}</Link>:null}
 {profile.identities.map(i=><PlaybookButton key={i.id} variant="secondary" className="tw-btn--sm" disabled={locked||!localUsable} onClick={()=>setDisconnect(i.id)}><PlaybookIcon name="link"/>{t.unlink}</PlaybookButton>)}
 {!profile.identities.length&&profile.provider?<PlaybookButton variant="secondary" className="tw-btn--sm" disabled={locked||!localUsable} onClick={()=>void link()}><PlaybookIcon name="link"/>{t.link}</PlaybookButton>:null}
 </div></footer>:null}</section>
 {verify?<SettingsDialog title={messages.accountEmail.verifyTitle} help={profile.local_password?messages.accountEmail.verifyHelp:messages.accountEmail.verifySsoHelp} meta={t.title} locked={command.busy} close={()=>{setVerify(false);setProof('');}}><form onSubmit={e=>{e.preventDefault();void sendVerification();}}><FactGrid band="both" facts={[{key:'email',label:t.email,value:profile.email}]}/><div className="tw-dialog__body tw-form-body tw-card__body--pad">{profile.local_password?<label className="tw-field"><span className="tw-field__label">{messages.access.currentPassword}</span><input className="tw-input" type="password" autoComplete="current-password" maxLength={1024} required disabled={locked} value={proof} onChange={e=>setProof(e.target.value)}/></label>:null}{command.notice?<p role="alert">{command.notice}</p>:null}</div><footer className="tw-dialog__foot"><PlaybookButton type="button" variant="secondary" disabled={command.busy} onClick={()=>{setVerify(false);setProof('');}}>{t.close}</PlaybookButton><PlaybookButton type="submit" disabled={locked}><PlaybookIcon name="check"/>{messages.accountEmail.verifyAction}</PlaybookButton></footer></form></SettingsDialog>:null}
 {disconnect?<SettingsDialog title={t.confirmUnlink} help={t.unlinkHelp} meta={t.signIn} locked={command.busy} close={()=>setDisconnect(null)}><div className="tw-dialog__body">{command.notice?<p role="alert">{command.notice}</p>:null}</div><footer className="tw-dialog__foot"><PlaybookButton variant="secondary" disabled={command.busy} onClick={()=>setDisconnect(null)}>{t.close}</PlaybookButton><PlaybookButton variant="danger" disabled={locked} onClick={()=>void unlink(disconnect)}><PlaybookIcon name="link"/>{t.unlink}</PlaybookButton></footer></SettingsDialog>:null}</div>;
}
