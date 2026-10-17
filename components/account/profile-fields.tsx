'use client';
import {useId} from 'react';
import {messages} from '@/i18n/messages';
import {FieldHelp} from '@/components/playbook/field-help';
export function ProfileFields({name,email,onName,onEmail,disabled=false,nameChanged=false,emailChanged=false}:{name:string;email:string;onName:(v:string)=>void;onEmail:(v:string)=>void;disabled?:boolean;nameChanged?:boolean;emailChanged?:boolean}){
 const t=messages.account,id=useId();return <><div className="tw-field"><div className="tw-field__head"><label htmlFor={id+'-name'} className="tw-field__label">{t.displayName}</label>{nameChanged?<span className="tw-tag">{messages.uiForms.changed}</span>:null}</div><input id={id+'-name'} className="tw-input" autoComplete="name" maxLength={100} value={name} disabled={disabled} onChange={e=>onName(e.target.value)}/></div>
 <div className="tw-field"><div className="tw-field__head"><label htmlFor={id+'-email'} className="tw-field__label">{t.email}</label><FieldHelp id={id+'-email-help'} label={t.email} help={t.emailHelp}/>{emailChanged?<span className="tw-tag">{messages.uiForms.changed}</span>:null}</div><input id={id+'-email'} aria-describedby={id+'-email-help'} className="tw-input" type="email" autoComplete="email" maxLength={254} value={email} disabled={disabled} onChange={e=>onEmail(e.target.value)}/></div></>;
}
