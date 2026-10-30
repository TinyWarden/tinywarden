"use client";
import {useRef,useState} from 'react';
import {skillActionGroups,type SkillActionChoice,type SkillActionTarget} from '@/lib/skills/action-choices';
import {ActionActivity,SkillOperations} from '@/components/playbook/action-activity';
import {PrepareDialog} from '@/app/fleet/_components/prepare-dialog';
import {ProgressDialog,type ProgressHint} from '@/app/fleet/_components/progress-dialog';
import {useActionLaunch} from './use-action-launch';
import {messages} from '@/i18n/messages';
import {maintenanceRecoveryRequired} from '@/lib/maintenance/policy';
import {dismissibleOperationNotice,operationActivityState,type SkillOperationSummary} from '@/lib/maintenance/operation-summary';
import {OperationHistory} from './operation-history';
import {useResultNotices} from './use-result-notices';

export function useServerActions({target,usable,reload}:{target:SkillActionTarget|undefined;usable:boolean;reload:()=>Promise<unknown>}){
 const notices=useResultNotices(reload);
 const [progress,setProgress]=useState<{id:string;hint:ProgressHint;installation:string;open:boolean;fromHistory:boolean}|null>(null);
 const [history,setHistory]=useState<{installation:string;open:boolean}|null>(null);
 const [preparation,setPreparation]=useState<{action:SkillActionChoice;row:SkillActionTarget}|null>(null);
 const visible=useRef<string|null>(null),focus=useRef<HTMLButtonElement|null>(null);
 function show(id:string,hint:ProgressHint,installation:string,fromHistory=false){visible.current=id;setHistory(current=>current?{...current,open:false}:null);setProgress({id,hint,installation,open:true,fromHistory});}
 function showSaved(job:SkillOperationSummary,fromHistory=false){show(job.operation_id,{kind:'maintenance_action',progress:job.progress,job:job.job_id,...(maintenanceRecoveryRequired(job)?{recoveryJob:job.job_id}:{})},job.installation_id,fromHistory);}
 function showHistory(installation:string){visible.current=null;setProgress(current=>current?{...current,open:false}:null);setHistory({installation,open:true});}
 function restore(){requestAnimationFrame(()=>{if(focus.current?.isConnected)focus.current.focus();else document.getElementById('main')?.focus();});}
 function close(){visible.current=null;setProgress(current=>current?{...current,open:false}:null);if(progress?.fromHistory&&history)setHistory({...history,open:true});else restore();void reload();}
 const launcher=useActionLaunch({reload,show,visible:id=>visible.current===id,prepare:(action,row)=>{
  visible.current=null;setProgress(null);setPreparation({action,row});
 }});
 function actions(installation:string){
  if(!target)return null;
  const job=target.maintenance_jobs?.job,ownJob=job?.installation_id===installation?job:null;
  const starting=launcher.starting?.installationId===installation?launcher.starting:null;
  const choices=usable&&!launcher.busy&&!launcher.uncertain&&!starting?skillActionGroups([target]).find(group=>group.id===installation)?.actions??[]:[];
  const saved=target.latest_operations?.find(job=>job.host_id===target.host_id&&job.installation_id===installation);
  if(!choices.length&&!ownJob&&!starting&&!saved)return null;
  const items=choices.map(action=>({label:action.name,action:(trigger:HTMLButtonElement)=>{
    if(!usable||launcher.busy||launcher.uncertain)return;focus.current=trigger;void launcher.start(action,target);
   }}));
  return {menu:<SkillOperations items={[...items,...(saved?[{label:messages.skillActions.recentResults,separatorBefore:true,action:(trigger:HTMLButtonElement)=>{focus.current=trigger;showHistory(installation);}}]:[])]}/>,
   activity:ownJob||starting||saved&&!notices.hidden(saved)?<ActionActivity receipt state={ownJob?operationActivityState(ownJob):starting?'running':saved?operationActivityState(saved):undefined} at={!ownJob&&!starting?saved?.completed_at??saved?.created_at:undefined}
    dismissDisabled={notices.saving===saved?.job_id} notice={saved&&notices.failed===saved.job_id?<span className="tw-action-activity__notice" role="alert">{messages.skillActions.dismissFailed}</span>:null}
    onDismiss={!ownJob&&!starting&&saved&&dismissibleOperationNotice(saved)?event=>{
     const menu=event.currentTarget.closest('.tw-skill')?.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
     void notices.dismiss(saved).then(ok=>{if(ok)requestAnimationFrame(()=>menu?.focus());});
    }:undefined}
    verificationRequired={!!ownJob&&maintenanceRecoveryRequired(ownJob)} name={ownJob?.progress?.name??starting?.hint.progress?.name??saved?.progress.name??messages.skillActions.running}
    attention={!!ownJob?.attention||!!ownJob?.recovery_pending||!!starting?.error} running={!!ownJob||!!starting} onProgress={event=>{
     focus.current=event.currentTarget;
     if(ownJob)show(ownJob.operation_id,{kind:'maintenance_action',progress:ownJob.progress?{...ownJob.progress,single:true,server:target.label}:undefined,job:ownJob.id,...(maintenanceRecoveryRequired(ownJob)?{recoveryJob:ownJob.id}:{})},installation);
     else if(starting)show(starting.id,starting.hint,installation);
     else if(saved)showSaved(saved);
    }}/>:null};
 }
 const dialogs=<>
  {preparation?<PrepareDialog single action={preparation.action.id} rows={[preparation.row]} close={()=>{setPreparation(null);restore();}} reload={reload}
   remember={(id,hint)=>show(id,hint??{kind:'maintenance_action'},preparation.action.installation_id)} created={()=>setPreparation(null)}/>:null}
  {history&&target?<OperationHistory key={target.host_id+history.installation} host={target.host_id} installation={history.installation} skillName={target.maintenance_jobs?.actions.find(a=>a.installation_id===history.installation)?.skill_name??messages.skillActions.title} server={target.label} open={history.open&&!preparation} close={()=>{setHistory({...history,open:false});restore();}} show={(job,trigger)=>{focus.current=trigger;showSaved(job,true);}}/>:null}
  {progress?<ProgressDialog key={progress.id+progress.hint.job} id={progress.id} hint={progress.hint} open={progress.open&&!preparation&&!history?.open}
   history={()=>showHistory(progress.installation)} close={close} launch={launcher.starting?.id===progress.id?launcher.launch:undefined}/>:null}
 </>;
 return {actions,dialogs};
}
