"use client";
import {useRef,useState} from 'react';
import {skillActionGroups,type SkillActionChoice,type SkillActionTarget} from '@/lib/skills/action-choices';
import {PlaybookButton} from '@/components/playbook/controls';
import {PlaybookIcon} from '@/components/playbook/skill';
import {ActionActivity,SkillActionBar} from '@/components/playbook/action-activity';
import {PrepareDialog} from '@/app/fleet/_components/prepare-dialog';
import {ProgressDialog,type ProgressHint} from '@/app/fleet/_components/progress-dialog';
import {useActionLaunch} from './use-action-launch';
import {messages} from '@/i18n/messages';

export function useServerActions({target,usable,reload}:{target:SkillActionTarget|undefined;usable:boolean;reload:()=>Promise<unknown>}){
 const [progress,setProgress]=useState<{id:string;hint:ProgressHint;installation:string;open:boolean}|null>(null);
 const [preparation,setPreparation]=useState<{action:SkillActionChoice;row:SkillActionTarget}|null>(null);
 const visible=useRef<string|null>(null),focus=useRef<HTMLButtonElement|null>(null);
 function show(id:string,hint:ProgressHint,installation:string){visible.current=id;setProgress({id,hint,installation,open:true});}
 function restore(){requestAnimationFrame(()=>{if(focus.current?.isConnected)focus.current.focus();else document.getElementById('main')?.focus();});}
 function close(){visible.current=null;setProgress(current=>current?{...current,open:false}:null);void reload();restore();}
 const launcher=useActionLaunch({reload,show,visible:id=>visible.current===id,prepare:(action,row)=>{
  visible.current=null;setProgress(null);setPreparation({action,row});
 }});
 function actions(installation:string){
  if(!target)return null;
  const job=target.maintenance_jobs?.job,ownJob=job?.installation_id===installation?job:null;
  const starting=launcher.starting?.installationId===installation?launcher.starting:null;
  const choices=usable&&!launcher.busy&&!launcher.uncertain&&!starting?skillActionGroups([target]).find(group=>group.id===installation)?.actions??[]:[];
  const saved=progress?.installation===installation?progress:null;
  if(!choices.length&&!ownJob&&!starting&&!saved)return null;
  return <SkillActionBar>
   {choices.map(action=><PlaybookButton key={action.id} type="button" variant="secondary" className="tw-btn--sm" title={action.description} onClick={event=>{
    if(!usable||launcher.busy||launcher.uncertain)return;focus.current=event.currentTarget;void launcher.start(action,target);
   }}><PlaybookIcon name="chevron-right"/>{action.name}</PlaybookButton>)}
   {ownJob||starting||saved?<ActionActivity name={ownJob?.progress?.name??starting?.hint.progress?.name??saved?.hint.progress?.name??messages.skillActions.running}
    attention={!!ownJob?.attention||!!ownJob?.recovery_pending||!!starting?.error} running={!!ownJob||!!starting} onProgress={event=>{
     focus.current=event.currentTarget;
     if(ownJob)show(ownJob.operation_id,{kind:'maintenance_action',progress:ownJob.progress},installation);
     else if(starting)show(starting.id,starting.hint,installation);
     else if(saved)show(saved.id,saved.hint,installation);
    }}/>:null}
  </SkillActionBar>;
 }
 const dialogs=<>
  {preparation?<PrepareDialog single action={preparation.action.id} rows={[preparation.row]} close={()=>{setPreparation(null);restore();}} reload={reload}
   remember={(id,hint)=>show(id,hint??{kind:'maintenance_action'},preparation.action.installation_id)} created={()=>setPreparation(null)}/>:null}
  {progress?<ProgressDialog key={progress.id} id={progress.id} hint={progress.hint} open={progress.open&&!preparation}
   close={close} launch={launcher.starting?.id===progress.id?launcher.launch:undefined}/>:null}
 </>;
 return {actions,dialogs};
}
