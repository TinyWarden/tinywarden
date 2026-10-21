"use client";
import {useEffect,useState} from "react";
import {messages} from "@/i18n/messages";
import {PlaybookButton,RowStatus} from "@/components/playbook/controls";
import {ChoiceCards} from "@/components/playbook/choice-cards";
import {localTime,utcTime} from "@/components/playbook/time-navigation";
import {text} from "@/components/operator/format";
import {useOperatorCommand} from "@/components/operator/use-operator-command";
import {postOperatorRead} from "@/components/operator/post-read";
import {Field,FleetDialog,GroupChecks,CommandNotice} from "./fields";
import {splitTags,targets,type GroupRow,type ServerRow} from "./model";
const t=messages.fleetManagement;
export type ManageMode='metadata'|'membership'|'maintenance'|'end'|'pause'|'resume'|'remove';
export function ManageDialog({mode,rows,groups,close,reload,operation}:{mode:ManageMode;rows:ServerRow[];groups:GroupRow[];close:()=>void;reload:()=>Promise<unknown>;operation:(id:string)=>void}){
 const first=rows[0]!,command=useOperatorCommand(30000,undefined,t.errors),locked=command.busy||command.uncertain;
 const [name,setName]=useState(first.label),[description,setDescription]=useState(first.description),[notes,setNotes]=useState(first.owner_notes??''),[selected,setSelected]=useState<string[]>(mode==='metadata'?first.groups:[]),[tags,setTags]=useState(mode==='metadata'?first.tags.join(', '):''),[membership,setMembership]=useState('add');
 const [now,setNow]=useState(true),[start,setStart]=useState(()=>localTime(new Date().toISOString())),[end,setEnd]=useState(()=>localTime(new Date(Date.now()+3600000).toISOString())),[noEnd,setNoEnd]=useState(false),[invalid,setInvalid]=useState('');
 const canArchive=rows.every(r=>r.lifecycle!=='archived'),[kind,setKind]=useState(canArchive?'archive':'delete'),[preview,setPreview]=useState<{preview:string;days:number}|null>(null),[previewFailed,setPreviewFailed]=useState(false),[confirmed,setConfirmed]=useState(false);
 useEffect(()=>{if(mode!=='remove')return;const controller=new AbortController();void postOperatorRead('/api/v1/operator/fleet-operations/preview',{kind,targets:targets(rows)},controller.signal).then(value=>{const v=value as {preview:string;days:number};if(controller.signal.aborted)return;if(typeof v.preview!=='string'||typeof v.days!=='number')throw new Error('invalid');setPreview(v);}).catch(()=>{if(!controller.signal.aborted)setPreviewFailed(true);});return()=>controller.abort();},[mode,rows,kind]);
 const title=mode==='metadata'?t.edit:mode==='membership'?t.changeGroups:mode==='maintenance'?t.scheduleMaintenance:mode==='end'?t.endMaintenance:mode==='pause'?t.pause:mode==='resume'?t.resume:t.remove;
 const help=mode==='metadata'?t.metadataHelp:mode==='membership'?t.membershipHelp:mode==='maintenance'||mode==='end'?t.maintenanceHelp:mode==='pause'?t.pauseHelp:mode==='resume'?t.resumeHelp:t.removeHelp;
 async function save(){
  let action:string=mode,values:Record<string,unknown>={};setInvalid('');
  if(mode==='metadata')values={label:name,description,owner_notes:notes,groups:selected,tags:splitTags(tags)};
  if(mode==='membership')values={add_groups:membership==='add'?selected:[],remove_groups:membership==='remove'?selected:[],add_tags:membership==='add'?splitTags(tags):[],remove_tags:membership==='remove'?splitTags(tags):[]};
  if(mode==='maintenance'||mode==='end'){
   const from=now?null:utcTime(start),to=noEnd?null:utcTime(end);if(mode==='maintenance'&&(!now&&!from||!noEnd&&!to||to&&Date.parse(to)<=(from?Date.parse(from):Date.now()))){setInvalid(t.windowInvalid);return;}
   action='maintenance';values={action:mode==='end'?'end':'schedule',starts_at:mode==='end'?null:from,ends_at:mode==='end'?null:to};
  }
  if(mode==='remove'){if(!preview||kind==='delete'&&!confirmed)return;action=kind;values={preview:preview.preview};}
  const request=crypto.randomUUID();operation(request);
  await command.send('/api/v1/operator/fleet-operations',{request_id:request,kind:action,targets:targets(rows),values},reload,()=>close());
 }
 return <FleetDialog title={title} help={help} close={close} locked={locked} actions={<PlaybookButton type="button" variant={mode==='remove'&&kind==='delete'?'danger':'primary'} disabled={locked||mode==='remove'&&(!preview||kind==='delete'&&!confirmed)||mode==='metadata'&&!name.trim()} onClick={()=>void save()}>{mode==='remove'?(kind==='delete'?t.confirmDelete:t.confirmArchive):mode==='metadata'||mode==='membership'?t.save:title}</PlaybookButton>}>
  <p className="tw-meta">{rows.length===1?first.label:text(t.selected,{count:rows.length})}</p>{mode==="remove"?<ul className="tw-access tw-fleet-targets">{rows.map(row=><li key={row.host_id} className="tw-access__item"><strong>{row.label}</strong><code>{row.host_id}</code></li>)}</ul>:null}
  <fieldset className="tw-form-body" disabled={locked}>
   {mode==='metadata'?<><Field label={t.name}><input className="tw-input" value={name} maxLength={100} onChange={e=>setName(e.target.value)}/></Field><Field label={t.description}><textarea className="tw-input" value={description} maxLength={2000} onChange={e=>setDescription(e.target.value)}/></Field><Field label={t.notes} help={t.notesHelp}><textarea className="tw-input" value={notes} maxLength={2000} onChange={e=>setNotes(e.target.value)}/></Field></>:null}
   {mode==='metadata'||mode==='membership'?<>{mode==='membership'?<Field label={t.groupAction}><select className="tw-input" value={membership} onChange={e=>setMembership(e.target.value)}><option value="add">{t.add}</option><option value="remove">{t.removeMembership}</option></select></Field>:null}<GroupChecks groups={groups} value={selected} change={setSelected}/><Field label={t.tags} help={t.tagsHelp}><input className="tw-input" value={tags} onChange={e=>setTags(e.target.value)}/></Field></>:null}
   {mode==='maintenance'?<><label className="tw-check"><input type="checkbox" checked={now} onChange={e=>setNow(e.target.checked)}/>{t.startNow}</label>{!now?<Field label={t.startsAt}><input type="datetime-local" className="tw-input" value={start} onChange={e=>setStart(e.target.value)}/></Field>:null}<label className="tw-check"><input type="checkbox" checked={noEnd} onChange={e=>setNoEnd(e.target.checked)}/>{t.noEnd}</label>{!noEnd?<Field label={t.endsAt}><input type="datetime-local" className="tw-input" value={end} onChange={e=>setEnd(e.target.value)}/></Field>:null}</>:null}
   {mode==='pause'&&rows.some(r=>!r.control_supported)?<p role="alert">{t.upgradeRequired}</p>:null}
   {mode==='remove'?<><ChoiceCards label={t.remove} value={kind} onChange={v=>{if(v==='archive'&&!canArchive)return;setKind(v);setPreview(null);setPreviewFailed(false);setConfirmed(false);}} options={[...(canArchive?[{value:'archive',title:t.archive,description:t.archiveHelp}]:[]),{value:'delete',title:t.delete,description:t.deleteHelp}]}/>{preview?<p>{text(t.retentionReminder,{days:preview.days})}</p>:previewFailed?<p role="alert">{t.previewChanged}</p>:<RowStatus status="running" value={t.previewLoading}/ >}{kind==='delete'?<label className="tw-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t.deleteConfirm}</label>:null}</>:null}
  </fieldset>{invalid?<p role="alert">{invalid}</p>:null}<CommandNotice command={command}/>
 </FleetDialog>;
}
