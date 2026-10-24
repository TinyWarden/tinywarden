"use client";
import {useRef} from 'react';
import {messages} from '@/i18n/messages';
import {maintenanceActions,registeredAction} from '@/lib/maintenance/policy';
import type {MaintenanceAction} from '@/lib/maintenance/contracts';
import {PlaybookButton} from '@/components/playbook/controls';
import {useOperatorCommand} from '@/components/operator/use-operator-command';
import {FleetDialog,CommandNotice} from './fields';
import {SelectionReview} from './selection-review';
import {partitionMaintenanceAction} from './maintenance-model';
import {targets,type ServerRow} from './model';

const t=messages.maintenanceActions;
export function PrepareDialog({action,rows,close,reload,remember,created}:{action:MaintenanceAction;rows:ServerRow[];close:()=>void;reload:()=>Promise<unknown>;remember:(id:string)=>void;created:(id:string)=>void}){
 const {eligible,skipped}=partitionMaintenanceAction(action,rows),definition=registeredAction(maintenanceActions,action)!;
 const command=useOperatorCommand(15000,undefined,{...messages.fleetManagement.errors,...t.errors}),request=useRef<string|null>(null),locked=command.busy||command.uncertain;
 async function start(){
  if(!eligible.length)return;
  const id=request.current??crypto.randomUUID();request.current=id;remember(id);
  await command.send('/api/v1/operator/fleet/maintenance',{request_id:id,action,targets:targets(eligible)},reload,value=>{
   if(!value||typeof value!=='object'||!('id' in value)||value.id!==id)throw new Error('maintenance_receipt_invalid');
   created(id);
  });
 }
 return <FleetDialog title={t.actions[action]} help={t.help[action]} close={close} locked={locked} step="prepare" actions={<PlaybookButton type="button" disabled={locked||!eligible.length} onClick={()=>void start()}>{definition.requires_approval?t.prepare:t.refresh}</PlaybookButton>}>
  <p>{t.scopeHelp}</p><SelectionReview rows={rows} eligible={eligible} skipped={skipped}/>
  {definition.requires_approval?<p>{t.policies[action]}</p>:null}
  <CommandNotice command={command}/>
 </FleetDialog>;
}
