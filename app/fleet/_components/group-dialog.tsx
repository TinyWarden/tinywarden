"use client";
import {useState} from "react";
import {messages} from "@/i18n/messages";
import {PlaybookButton} from "@/components/playbook/controls";
import {useFleetGroups} from "@/components/operator/use-fleet-groups";
import {useOperatorCommand} from "@/components/operator/use-operator-command";
import {Field,FleetDialog,CommandNotice} from "./fields";
import type {GroupRow} from "./model";
const t=messages.fleetManagement;
export function GroupDialog({groups,close,reload}:{groups:GroupRow[];close:()=>void;reload:()=>Promise<unknown>}){
 const [id,setId]=useState(''),[name,setName]=useState(''),[description,setDescription]=useState(''),[remove,setRemove]=useState(false),command=useOperatorCommand(15000,undefined,t.errors),locked=command.busy||command.uncertain;
 const [query,setQuery]=useState(''),read=useFleetGroups(query,id?[id]:[]),choices=[...new Map([...(read.value?.selected??[]),...(read.value?.groups??groups.slice(0,50))].map(g=>[g.id,g])).values()],group=choices.find(g=>g.id===id);
 async function save(){await command.send('/api/v1/operator/fleet-groups',{action:remove?'delete':group?'save':'create',id:group?.id??null,expected_revision:group?.revision??null,name:remove?null:name,description:remove?null:description},async()=>{await reload();await read.reload();},()=>{setId('');setName('');setDescription('');setRemove(false);});}
 return <FleetDialog title={t.manageGroups} help={t.groupsHelp} close={close} locked={locked} actions={<PlaybookButton type="button" variant={remove?'danger':'primary'} disabled={locked||!remove&&!name.trim()} onClick={()=>void save()}>{remove?t.deleteGroup:group?t.save:t.createGroup}</PlaybookButton>}>
  <fieldset className="tw-form-body" disabled={locked}><Field label={t.searchGroups}><input type="search" className="tw-input" value={query} maxLength={64} onChange={e=>setQuery(e.target.value)}/></Field><Field label={t.groups}><select className="tw-input" value={id} onChange={e=>{const next=choices.find(g=>g.id===e.target.value);setId(e.target.value);setName(next?.name??'');setDescription(next?.description??'');setRemove(false);}}><option value="">{t.createGroup}</option>{choices.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
  {read.previous||read.next?<div className="tw-btns"><PlaybookButton type="button" variant="secondary" className="tw-btn--sm" disabled={read.busy||!read.previous} onClick={read.back}>{t.previous}</PlaybookButton><PlaybookButton type="button" variant="secondary" className="tw-btn--sm" disabled={read.busy||!read.next} onClick={read.forward}>{t.next}</PlaybookButton></div>:null}{!remove?<><Field label={t.groupName}><input className="tw-input" value={name} maxLength={64} onChange={e=>setName(e.target.value)}/></Field><Field label={t.groupDescription}><textarea className="tw-input" value={description} maxLength={2000} onChange={e=>setDescription(e.target.value)}/></Field></>:null}
  {group?<label className="tw-check"><input type="checkbox" checked={remove} onChange={e=>setRemove(e.target.checked)}/>{t.deleteGroup}</label>:null}{remove?<p>{t.deleteGroupHelp}</p>:null}</fieldset><CommandNotice command={command}/>
 </FleetDialog>;
}
