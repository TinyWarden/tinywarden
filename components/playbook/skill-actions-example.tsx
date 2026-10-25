"use client";
import {useState} from 'react';
import {messages} from '@/i18n/messages';
import type {ValueSchema} from '@/lib/skills/package-types';
import {ActionInputs,emptyActionValue} from '@/components/skills/action-inputs';
import {ActionPermissionReview,type ActionPermissionDetails} from '@/components/skills/action-permission-review';
import {PlaybookButton} from './controls';
import {SettingsDialog} from './skill';

const t=messages.skillActions;
const catalog={
 name:{text:t.sampleAction,parameters:{}},description:{text:t.sampleDescription,parameters:{}},
 target:{text:t.sampleTarget,parameters:{}},confirm:{text:t.sampleConfirm,parameters:{}},
};
const schema:ValueSchema={type:'object',additionalProperties:false,required:['target','confirm'],properties:{
 target:{type:'string',minLength:1,maxLength:100,label_key:'target'},confirm:{type:'boolean',label_key:'confirm'},
}};
const sample:ActionPermissionDetails={catalog,skill_id:'example/service-check',package_version:'1.0.0',
 descriptor:{name_key:'name',description_key:'description',execution_class:'host_admin'}};
/** Shared components with inert local state; never requests real permission or work. */
export function SkillActionsExample(){
 const [value,setValue]=useState(()=>emptyActionValue(schema)),[open,setOpen]=useState(false),[confirmed,setConfirmed]=useState(false);
 const close=()=>{setOpen(false);setConfirmed(false);};
 return <section className="tw-card"><div className="tw-card__body tw-form-body"><h3 className="tw-t-head">{t.title}</h3><p>{t.metadataOnly}</p>
  <ActionInputs schema={schema} catalog={catalog} value={value} change={setValue} label={t.parameters}/>
  <div className="tw-btns"><PlaybookButton type="button" variant="secondary" onClick={()=>setOpen(true)}>{t.review}</PlaybookButton></div>
 </div>{open?<SettingsDialog title={t.review} meta={t.title} help={t.metadataOnly} close={close} step="permission">
  <div className="tw-dialog__body tw-form-body"><ActionPermissionReview snapshot={sample} confirmed={confirmed} confirm={setConfirmed}/></div>
  <footer className="tw-dialog__foot"><PlaybookButton type="button" variant="secondary" onClick={close}>{messages.fleetManagement.close}</PlaybookButton><PlaybookButton type="button" disabled={!confirmed} onClick={close}>{t.allow}</PlaybookButton></footer>
 </SettingsDialog>:null}</section>;
}
