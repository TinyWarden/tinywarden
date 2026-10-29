"use client";
import {useRef,useState} from 'react';
import {messages} from '@/i18n/messages';
import {consumeAuthority} from '@/components/operator/authority';
import {useOperatorCommand} from '@/components/operator/use-operator-command';
import {validActionGrants} from './action-model';
import type {SkillActionChoice,SkillActionTarget} from '@/lib/skills/action-choices';
import {actionProgressContext,actionStartBody,canStartImmediately} from '@/app/fleet/_components/skill-action-start';
import type {ProgressHint} from '@/app/fleet/_components/progress-dialog';

type Starting={id:string;hostId:string;installationId:string;hint:ProgressHint;loading:boolean;error:boolean};
/** One controller per screen, shared by row menus and all server skill cards. */
export function useActionLaunch({reload,show,prepare,visible}:{reload:()=>Promise<unknown>;
 show:(id:string,hint:ProgressHint,installationId:string)=>void;
 prepare:(action:SkillActionChoice,row:SkillActionTarget)=>void;visible:(id:string)=>boolean}){
 const command=useOperatorCommand(15000,undefined,{...messages.fleetManagement.errors,...messages.maintenanceActions.errors});
 const [starting,setStarting]=useState<Starting|null>(null),lock=useRef(false);
 const attempt=useRef<{action:SkillActionChoice;row:SkillActionTarget;id:string}|null>(null);
 async function start(action:SkillActionChoice,row:SkillActionTarget,retryId?:string){
  if(lock.current||command.uncertain)return;
  const id=retryId??crypto.randomUUID(),hint:ProgressHint={kind:'maintenance_action',progress:{name:action.name,single:true,server:row.label,
   presentation:{name:action.name,description:action.description,requires_approval:action.requires_approval,reason:null,facts:[]}}};
  lock.current=true;attempt.current={action,row,id};command.clearNotice();
  setStarting({id,hostId:row.host_id,installationId:action.installation_id,hint,loading:true,error:false});show(id,hint,action.installation_id);
  try{
   const response=await fetch(`/api/v2/operator/skills/${encodeURIComponent(action.installation_id)}/actions`,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error('unavailable');
   const source:unknown=await response.json();if(!validActionGrants(source)||source.installation_id!==action.installation_id)throw new Error('unavailable');consumeAuthority(source);
   const choice=source.actions.find(a=>a.grant_id===action.id&&a.enabled);
   if(!choice||choice.snapshot.descriptor.id!==action.action_id)throw new Error('unavailable');
   if(!canStartImmediately(choice.snapshot)){setStarting(null);if(visible(id))prepare(action,row);return;}
   const currentHint:ProgressHint={kind:'maintenance_action',progress:actionProgressContext(choice.snapshot,[row])};
   setStarting(current=>current?.id===id?{...current,hint:currentHint}:current);
   // Updating display metadata must not reopen a dialog the user has closed.
   if(visible(id))show(id,currentHint,action.installation_id);
   const body=actionStartBody(id,action.id,source,choice,[row],{});
   if(body.targets.length!==1||body.targets[0]!.id!==row.host_id)throw new Error('scope');
   const accepted=await command.send('/api/v1/operator/fleet/maintenance',body,reload,value=>{
    if(!value||typeof value!=='object'||!('id' in value)||value.id!==id)throw new Error('maintenance_receipt_invalid');
    setStarting(null);
   });
   if(!accepted)setStarting(current=>current?.id===id?{...current,error:true}:current);
  }catch{setStarting(current=>current?.id===id?{...current,error:true}:current);}
  finally{lock.current=false;setStarting(current=>current?.id===id?{...current,loading:false}:current);}
 }
 function retry(){
  if(command.uncertain)return void command.retry(reload);
  const saved=attempt.current;if(saved)void start(saved.action,saved.row,saved.id);
 }
 return {start,starting,busy:!!starting?.loading||command.busy,uncertain:command.uncertain,
  launch:starting?{...starting,loading:starting.loading||command.busy,uncertain:command.uncertain,notice:command.notice,retry}:undefined};
}
