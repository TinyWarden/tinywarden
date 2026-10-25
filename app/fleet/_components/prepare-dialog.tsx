"use client";
import {useRef,useState} from 'react';
import {messages} from '@/i18n/messages';
import {packageText} from '@/lib/skills/package-types';
import {matchesSchema} from '@/lib/skills/schema-values';
import type {MaintenanceAction} from '@/lib/maintenance/contracts';
import {PlaybookButton} from '@/components/playbook/controls';
import {useOperatorCommand} from '@/components/operator/use-operator-command';
import {useOperatorRead} from '@/components/operator/use-operator-read';
import {validActionGrants,type ActionGrantRead} from '@/components/skills/action-model';
import {ActionInputs,emptyActionValue} from '@/components/skills/action-inputs';
import {FleetDialog,CommandNotice} from './fields';
import {SelectionReview} from './selection-review';
import {partitionMaintenanceAction} from './maintenance-model';
import {targets,type ServerRow} from './model';

const t=messages.maintenanceActions;
type Props={action:MaintenanceAction;rows:ServerRow[];close:()=>void;reload:()=>Promise<unknown>;remember:(id:string)=>void;created:(id:string)=>void};
export function PrepareDialog(props:Props){
 const offered=props.rows.flatMap(r=>r.maintenance_jobs?.actions??[]).find(a=>a.id===props.action);
 const read=useOperatorRead(`/api/v2/operator/skills/${offered?.installation_id??''}/actions`,validActionGrants,30000,!!offered?.installation_id);
 const choice=read.value?.actions.find(a=>a.grant_id===props.action&&a.enabled);
 const [pinned,setPinned]=useState<{source:ActionGrantRead;choice:ActionGrantRead['actions'][number]}|null>(null);
 // Pin the first reviewed version. A refresh cannot remount and lose an uncertain command.
 if(!pinned&&choice&&read.value)setPinned({source:read.value,choice});
 if(!pinned)return <FleetDialog title={offered?.name??t.progress} help={messages.skillActions.help} close={props.close}><p role={read.failed?'alert':'status'}>{read.failed?messages.skillActions.unavailable:messages.skillActions.loading}</p></FleetDialog>;
 const changed=read.expired||read.failed||!choice||choice.revision!==pinned.choice.revision||read.value?.content_sha256!==pinned.source.content_sha256;
 return <PreparedAction {...props} source={pinned.source} choice={pinned.choice} changed={changed}/>;
}
function PreparedAction({action,rows,close,reload,remember,created,source,choice,changed}:Props&{source:ActionGrantRead;choice:ActionGrantRead['actions'][number];changed:boolean}){
 const {eligible,skipped}=partitionMaintenanceAction(action,rows),snapshot=choice.snapshot,descriptor=snapshot.descriptor;
 const [input,setInput]=useState(()=>emptyActionValue(snapshot.schemas.input));
 const command=useOperatorCommand(15000,undefined,{...messages.fleetManagement.errors,...t.errors}),request=useRef<string|null>(null),locked=command.busy||command.uncertain;
 async function start(){
  if(changed||!eligible.length||!matchesSchema(snapshot.schemas.input,input))return;
  const id=request.current??crypto.randomUUID();request.current=id;remember(id);
  await command.send('/api/v1/operator/fleet/maintenance',{request_id:id,grant_id:action,content_sha256:source.content_sha256,
   descriptor_sha256:snapshot.descriptor_sha256,permission_revision:choice.revision,input_json:JSON.stringify(input),targets:targets(eligible)},reload,value=>{
   if(!value||typeof value!=='object'||!('id' in value)||value.id!==id)throw new Error('maintenance_receipt_invalid');created(id);
  });
 }
 return <FleetDialog title={packageText(snapshot.catalog,{key:descriptor.name_key,params:{}})} help={packageText(snapshot.catalog,{key:descriptor.description_key,params:{}})} close={close} locked={locked} step="prepare"
  actions={<PlaybookButton type="button" disabled={locked||changed||!eligible.length||!matchesSchema(snapshot.schemas.input,input)} onClick={()=>void start()}>{descriptor.requires_approval?t.prepare:messages.skillActions.continue}</PlaybookButton>}>
  <p>{t.scopeHelp}</p><SelectionReview rows={rows} eligible={eligible} skipped={skipped} execution/>
  {Object.keys(snapshot.schemas.input.properties??{}).length?<fieldset disabled={locked}><ActionInputs schema={snapshot.schemas.input} catalog={snapshot.catalog} value={input} change={setInput} label={messages.skillActions.parameters}/></fieldset>:null}
  <CommandNotice command={command}/>
  {changed?<p className="tw-notice" role="alert">{messages.skillActions.changed}</p>:null}
 </FleetDialog>;
}
