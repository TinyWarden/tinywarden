'use client';
import {useId,useState} from 'react';
import {messages} from '@/i18n/messages';
import {text} from '@/components/operator/format';
import {SettingsShell} from '../settings-shell';
import {PlaybookButton} from '@/components/playbook/controls';
import {PlaybookIcon} from '@/components/playbook/skill';
import {FactGrid} from '@/components/playbook/data';
import {FieldHelp} from '@/components/playbook/field-help';
import {ChoiceCards} from '@/components/playbook/choice-cards';
import {DisabledAction,InlineAlert} from '@/components/playbook/forms';
import {useAccountRead,useAccountCommand} from '@/components/account/use-account-api';
const t=messages.oidc,u=messages.uiForms;
type Mapping={external_group:string;group_id:string};
type Provider={label:string;issuer:string;client_id:string;enabled:boolean;groups_claim:string};
type View={revision:string;provider:Provider|null;mappings:Mapping[];groups:{id:string;name:string}[];linked:number;secret_configured:boolean;callback_url:string};
const modes=[{value:'local',title:t.local,description:t.localHelp},{value:'oidc',title:t.oidc,description:t.oidcHelp}];
export function SignInClient(){
 const read=useAccountRead<View>('/api/v1/operator/oidc/settings');
 return read.value?<SignInDraft key={read.value.revision} value={read.value} reload={read.reload}/>:<SettingsShell active="signIn"><section className="tw-card"><header className="tw-card__head"><h2 className="tw-t-section">{t.method}</h2></header><div className="tw-card__body tw-card__body--pad"><p role={read.error?'alert':'status'}>{read.error?t.failed:t.loading}</p>{read.error?<PlaybookButton onClick={read.reload}><PlaybookIcon name="refresh"/>{messages.account.reload}</PlaybookButton>:null}</div></section></SettingsShell>;
}
function SignInDraft({value,reload}:{value:View;reload:()=>void}){
 const id=useId(),p=value.provider;
 const [label,setLabel]=useState(p?.label??t.defaultLabel),[issuer,setIssuer]=useState(p?.issuer??''),[clientId,setClientId]=useState(p?.client_id??''),[enabled,setEnabled]=useState(p?.enabled??false),[groupsClaim,setGroupsClaim]=useState(p?.groups_claim??'groups');
 const [mappings,setMappings]=useState(()=>value.mappings.map(m=>({...m,key:crypto.randomUUID()}))),command=useAccountCommand();
 const locked=command.busy||command.uncertain,modeDirty=enabled!==(p?.enabled??false);
 const draftMappings=mappings.map(({external_group,group_id})=>({external_group,group_id}));
 const dirty=modeDirty||(enabled&&(label!==(p?.label??t.defaultLabel)||issuer!==(p?.issuer??'')||clientId!==(p?.client_id??'')||groupsClaim!==(p?.groups_claim??'groups')||JSON.stringify(draftMappings)!==JSON.stringify(value.mappings)));
 const missing=enabled&&dirty?(!issuer.trim()||!clientId.trim()?t.fieldsRequired:!value.secret_configured?t.secretRequired:null):null;
 async function save(){
  if(locked||!dirty||missing)return;
  // Hidden drafts never overwrite the stored provider when selecting Local.
  const provider=enabled?{label,issuer,client_id:clientId,groups_claim:groupsClaim}:p;
  if(!provider)return;
  if(await command.send('/api/v1/operator/oidc/settings',{expected_revision:value.revision,label:provider.label,issuer:provider.issuer,client_id:provider.client_id,groups_claim:provider.groups_claim,enabled,mappings:enabled?draftMappings:value.mappings}))reload();
 }
 const field=(key:string,title:string,v:string,change:(v:string)=>void,help?:string,immutable=false,max=2048,mono=false)=><div className="tw-field"><div className="tw-field__head"><label className="tw-field__label" htmlFor={id+key}>{title}</label>{help?<FieldHelp id={id+key+'-help'} label={title} help={help}/>:null}</div><input id={id+key} aria-describedby={help?id+key+'-help':undefined} className={'tw-input'+(mono?' tw-input--mono':'')} type={key==='issuer'?'url':'text'} value={v} disabled={locked||immutable} required maxLength={max} onChange={e=>change(e.target.value)}/></div>;
 const footer=<footer className="tw-card__foot">{command.notice?<p role="alert">{command.notice}</p>:null}{command.uncertain?<PlaybookButton type="button" variant="secondary" onClick={reload}><PlaybookIcon name="refresh"/>{messages.account.reload}</PlaybookButton>:<DisabledAction reason={missing}><PlaybookButton type="submit" disabled={locked||!dirty||!!missing}><PlaybookIcon name="check"/>{modeDirty?(enabled?t.switchOidc:t.switchLocal):t.save}</PlaybookButton></DisabledAction>}</footer>;
 return <SettingsShell active="signIn" dirty={dirty} signInMethod={p?.enabled?t.provider+' · '+p.label:t.local}><form className="tw-settings-content" onSubmit={e=>{e.preventDefault();void save();}}>
 <section className="tw-card"><header className="tw-card__head"><div className="tw-card__titles"><h2 className="tw-t-section">{t.method}</h2><p className="tw-t-secondary">{t.methodHelp}</p></div></header>
 <div className="tw-card__body tw-form-body tw-form-body--compact"><ChoiceCards label={t.method} options={modes} value={enabled?'oidc':'local'} savedValue={p?.enabled?'oidc':'local'} disabled={locked} onChange={v=>setEnabled(v==='oidc')}/>
 {modeDirty?<InlineAlert tone="warning" title={enabled?t.pendingOidc:t.pendingLocal}>{enabled?t.pendingOidcHelp:text(t.pendingLocalHelp,{provider:p?.label??t.defaultLabel})}</InlineAlert>:null}</div>
 {!enabled?footer:null}</section>
 {enabled?<><section className="tw-card"><header className="tw-card__head"><div className="tw-card__titles"><h2 className="tw-t-section">{t.provider}</h2><p className="tw-t-secondary">{t.providerHelp}</p></div></header>
 <div className="tw-card__body tw-form-body"><div className="tw-fields tw-fields--wide">{field('issuer',t.issuer,issuer,setIssuer,t.issuerHelp,value.linked>0,2048,true)}{field('client',t.clientId,clientId,setClientId,undefined,value.linked>0,256,true)}{field('label',t.label,label,setLabel,undefined,false,64)}{field('claim',t.groupsClaim,groupsClaim,setGroupsClaim,t.groupsClaimHelp,false,64,true)}</div></div>
 <FactGrid band="top" facts={[{key:'secret',label:t.secret,value:value.secret_configured?t.secretConfigured:t.secretMissing,muted:!value.secret_configured},{key:'linked',label:t.linkedAccounts,value:value.linked,mono:true}]}/>
 <div className="tw-card__row tw-card__row--form"><h3 className="tw-t-head">{t.setup}</h3><ol className="tw-steps tw-steps--setup"><li><div><span>{u.secretStep} <FieldHelp id={id+'-secret-help'} label={t.secret} help={u.neverSecret}/></span><code className="tw-cmd tw-cmd--boxed">{t.secretCommand}</code></div></li><li><div><span>{u.redirectStep} <FieldHelp id={id+'-callback-help'} label={t.callback} help={t.callbackHelp}/></span><code className="tw-cmd tw-cmd--boxed">{value.callback_url}</code></div></li></ol></div>
 <div className="tw-card__row tw-card__row--form"><InlineAlert title={t.provisioningTitle}>{t.provisioningHelp}</InlineAlert></div>
 <div className="tw-card__row tw-card__row--intro"><h3 className="tw-t-head">{t.mappings}</h3><p className="tw-t-secondary">{t.mappingsHelp}</p></div>
 <div className="tw-data-scroll"><table className={'tw-table tw-mapping-table'+(mappings.length?' tw-table--stack':'')}><colgroup><col/><col/>{mappings.length?<col/>:null}</colgroup><thead><tr><th scope="col">{t.externalGroup}</th><th scope="col">{t.localGroup}</th>{mappings.length?<th scope="col"><span className="tw-sr">{u.actions}</span></th>:null}</tr></thead><tbody>
 {mappings.map((mapping,index)=><tr key={mapping.key}><td data-label={t.externalGroup}><input className="tw-input" aria-label={t.externalGroup} required maxLength={256} disabled={locked} value={mapping.external_group} onChange={e=>setMappings(current=>current.map((m,i)=>i===index?{...m,external_group:e.target.value}:m))}/></td>
 <td data-label={t.localGroup}><span className="tw-select"><select aria-label={t.localGroup} required disabled={locked} value={mapping.group_id} onChange={e=>setMappings(current=>current.map((m,i)=>i===index?{...m,group_id:e.target.value}:m))}><option value="">{t.selectGroup}</option>{value.groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></span></td>
 <td><PlaybookButton type="button" variant="secondary" className="tw-btn--sm" disabled={locked} aria-label={t.removeMapping} onClick={()=>setMappings(current=>current.filter((_,i)=>i!==index))}><PlaybookIcon name="remove"/>{t.removeMapping}</PlaybookButton></td></tr>)}
 {!mappings.length?<tr className="tw-table__state"><td className="tw-table__empty" colSpan={2}>{t.emptyMappings}</td></tr>:null}</tbody></table></div>
 <footer className="tw-card__foot"><DisabledAction reason={!value.groups.length?t.noGroups:null}><PlaybookButton type="button" variant="secondary" className="tw-btn--sm" disabled={locked||mappings.length>=128||!value.groups.length} onClick={()=>setMappings(current=>[...current,{key:crypto.randomUUID(),external_group:'',group_id:''}])}><PlaybookIcon name="plus"/>{t.addMapping}</PlaybookButton></DisabledAction></footer></section>
 <section className="tw-card"><header className="tw-card__head"><h2 className="tw-t-section">{t.rules}</h2></header><FactGrid band="top" facts={[{key:'session',label:u.providerSession,value:u.providerSessionValue},{key:'groups',label:u.groupAccess,value:u.groupAccessValue},{key:'disable',label:u.disableUser,value:u.disableUserValue},{key:'logout',label:u.signOut,value:u.signOutValue}]}/><div className="tw-card__body tw-card__body--pad"><InlineAlert title={t.fallbackTitle}>{t.fallbackHelp}</InlineAlert></div>{footer}</section></>:null}
 </form></SettingsShell>;
}
