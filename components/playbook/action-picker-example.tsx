"use client";
import {useRef,useState} from 'react';
import {messages} from '@/i18n/messages';
import {SkillActionPicker} from '@/components/skills/action-picker';
import type {SkillActionGroup,SkillActionOption} from '@/lib/skills/action-choices';
import {ActionMenu} from './action-menu';
import {PlaybookButton} from './controls';
import {SettingsDialog} from './skill';

const t=messages.skillActions;
const sample:SkillActionGroup={id:'00000000-0000-4000-8000-000000000010',skill_id:'example/service-checks',name:t.pickerSampleSkill,actions:[{
 id:'00000000-0000-4000-8000-000000000001',installation_id:'00000000-0000-4000-8000-000000000010',skill_id:'example/service-checks',skill_name:t.pickerSampleSkill,
 action_id:'service.check',name:t.sampleAction,description:t.sampleDescription,requires_approval:false,available:true,reason:null,eligible:1,total:1}]};
/** Public gallery uses inert sample data and the production picker composition. */
export function ActionPickerExample(){
 const [mode,setMode]=useState<'one'|'many'|'empty'|'long'|null>(null),[selected,setSelected]=useState<SkillActionOption|null>(null);
 const origin=useRef<HTMLButtonElement|null>(null);
 const close=()=>{setMode(null);setSelected(null);requestAnimationFrame(()=>origin.current?.focus());};
 const extra={...sample,id:'00000000-0000-4000-8000-000000000011',skill_id:'example/archive',name:t.pickerSampleOtherSkill,
  actions:[{...sample.actions[0]!,id:'00000000-0000-4000-8000-000000000002',installation_id:'00000000-0000-4000-8000-000000000011',
   skill_id:'example/archive',skill_name:t.pickerSampleOtherSkill,name:t.pickerSampleOtherAction,eligible:1,total:2}]};
 const groups=mode==='empty'?[]:mode==='many'?[extra,{...sample,actions:sample.actions.map(a=>({...a,eligible:2,total:2}))}]:mode==='long'?[{...sample,actions:sample.actions.map(a=>({...a,name:t.pickerSampleLongName}))}]:[sample];
 return <section className="tw-card"><div className="tw-card__body tw-form-body"><h3 className="tw-t-head">{t.title}</h3><p>{t.metadataOnly}</p><div className="tw-btns">
  <ActionMenu label={messages.fleetManagement.manage} items={[{label:messages.fleetManagement.edit,action:()=>{}},
   {label:t.pickerMenu,separatorBefore:true,next:true,action:trigger=>{origin.current=trigger;setMode('one');}},{label:messages.fleetManagement.remove,separatorBefore:true,danger:true,action:()=>{}}]}/>
  {(['many','empty','long'] as const).map(value=><PlaybookButton key={value} variant="secondary" type="button" onClick={event=>{origin.current=event.currentTarget;setMode(value);}}>{t[value==='many'?'pickerExampleMany':value==='empty'?'pickerExampleEmpty':'pickerExampleLong']}</PlaybookButton>)}
 </div></div>{mode?<SettingsDialog title={selected?.name??t.title} meta={messages.fleetManagement.title} help={t.metadataOnly} close={close} step={selected?.id??'picker'}>
  <div className="tw-dialog__body tw-form-body">{selected?<p>{selected.description}</p>:<SkillActionPicker groups={groups} choose={setSelected}/>}</div>
  <footer className="tw-dialog__foot"><PlaybookButton variant="secondary" type="button" onClick={close}>{messages.fleetManagement.close}</PlaybookButton></footer>
 </SettingsDialog>:null}</section>;
}
