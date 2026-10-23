"use client";
import {useLayoutEffect,useRef,useState} from "react";
import {messages} from "@/i18n/messages";
import {PlaybookButton,WidgetState,EmptyState} from "@/components/playbook/controls";
import {DataTable} from "@/components/playbook/data";
import {useFleetGroupList} from "@/components/operator/use-fleet-groups";
import {useOperatorCommand} from "@/components/operator/use-operator-command";
import {text} from "@/components/operator/format";
import {Field,FleetDialog,CommandNotice} from "./fields";
import type {GroupRow} from "./model";
const t=messages.fleetManagement;
type View='list'|'form'|'delete';

export function GroupDialog({close,reload}:{close:()=>void;reload:()=>Promise<unknown>}){
 const read=useFleetGroupList(),command=useOperatorCommand(15000,undefined,t.errors),locked=command.busy||command.uncertain;
 const [view,setView]=useState<View>('list'),[group,setGroup]=useState<GroupRow|null>(null),[name,setName]=useState(''),[description,setDescription]=useState(''),[attempted,setAttempted]=useState(false);
 const list=useRef<HTMLDivElement>(null),confirmation=useRef<HTMLDivElement>(null),create=useRef<HTMLButtonElement>(null),input=useRef<HTMLInputElement>(null),position=useRef(0),focusId=useRef<string|null>(null),returning=useRef(false);
 const groups=read.value?.groups??[],unavailable=read.failed||read.expired||read.outdated;
 function open(next:GroupRow|null){position.current=list.current?.scrollTop??0;focusId.current=next?.id??null;setGroup(next);setName(next?.name??'');setDescription(next?.description??'');setAttempted(false);setView('form');}
 function back(){returning.current=true;setView('list');}
 useLayoutEffect(()=>{
  if(view==='form')input.current?.focus();
  if(view==='delete')confirmation.current?.focus();
 },[view]);
 useLayoutEffect(()=>{
  if(view==='list'&&returning.current&&!locked&&!read.busy){
   const button=Array.from(list.current?.querySelectorAll<HTMLButtonElement>('button[data-group]')??[]).find(b=>b.dataset.group===focusId.current);
   (button??create.current)?.focus({preventScroll:true});
   if(list.current)list.current.scrollTop=position.current;
   returning.current=false;
  }
 },[view,locked,read.busy]);
 async function refresh(){await reload();await read.reload();}
 async function save(){
  setAttempted(true);
  await command.send('/api/v1/operator/fleet-groups',{action:view==='delete'?'delete':group?'save':'create',id:group?.id??null,expected_revision:group?.revision??null,name:view==='delete'?null:name,description:view==='delete'?null:description},refresh,back);
 }
 const title=view==='list'?t.manageGroups:view==='delete'?t.deleteGroup:group?t.editGroup:t.createGroup;
 const retryCommand={...command,retry:()=>command.retry(refresh)};
 return <FleetDialog title={title} help={t.groupsHelp} close={close} locked={locked} cancel={view==='list'?close:view==='delete'?()=>{setAttempted(false);setView('form');}:back} cancelLabel={view==='list'?t.close:t.cancel}
  leading={view==='form'&&group?<PlaybookButton type="button" variant="secondary" disabled={locked} onClick={()=>{setAttempted(false);setView('delete');}}>{t.deleteGroup}</PlaybookButton>:null}
  actions={view==='list'?null:<PlaybookButton type="button" variant={view==='delete'?'danger':'primary'} disabled={locked||view!=='delete'&&!name.trim()} onClick={()=>void save()}>{view==='delete'?t.deleteGroup:group?t.save:t.createGroup}</PlaybookButton>}>
  {view==='list'?<>
   <div className="tw-fleet-toolbar"><PlaybookButton ref={create} type="button" disabled={locked||unavailable||!read.value} onClick={()=>open(null)}>{t.createGroup}</PlaybookButton></div>
   {unavailable?<><WidgetState state="error"/><PlaybookButton type="button" variant="secondary" disabled={read.busy} onClick={()=>void read.reload()}>{t.retry}</PlaybookButton></>:!read.value?<WidgetState state="loading"/>:groups.length?<div className="tw-fleet-group-list" ref={list}>
    <DataTable className="tw-table--stack tw-table--edge-align tw-table--wrap-headings" columns={[{key:'group',label:t.groupName},{key:'count',label:t.groupServers},{key:'edit',label:t.actions}]} rowIds={groups.map(g=>g.id)} rows={groups.map(g=>({group:<div className="tw-fleet-name"><strong>{g.name}</strong>{g.description?<span className="tw-t-secondary">{g.description}</span>:null}</div>,count:<span className="tw-fleet-group-count"><span className="tw-meta">{t.groupServers}</span>{g.count}</span>,edit:<PlaybookButton type="button" variant="secondary" className="tw-btn--sm" data-group={g.id} aria-label={text(t.editNamedGroup,{name:g.name})} disabled={locked||read.busy} onClick={()=>open(g)}>{t.editGroup}</PlaybookButton>}))}/>
   </div>:<EmptyState title={t.emptyGroups}/>}
  </>:<>
   <button type="button" className="tw-textbtn tw-textbtn--bare tw-fleet-group-back" disabled={locked} onClick={back}>{t.backToGroups}</button>
   {view==='delete'?<div ref={confirmation} tabIndex={-1} role="group" aria-label={text(t.confirmDeleteGroup,{name:group!.name})} className="tw-notice"><strong>{text(t.confirmDeleteGroup,{name:group!.name})}</strong><p>{t.deleteGroupHelp}</p></div>:<fieldset className="tw-form-body" disabled={locked}>
    <Field label={t.groupName}><input ref={input} className="tw-input" value={name} maxLength={64} onChange={e=>setName(e.target.value)}/></Field>
    <Field label={t.groupDescription}><textarea className="tw-input" value={description} maxLength={2000} onChange={e=>setDescription(e.target.value)}/></Field>
   </fieldset>}
  </>}
  {attempted?<CommandNotice command={retryCommand}/>:null}
 </FleetDialog>;
}
