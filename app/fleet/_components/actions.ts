import {messages} from '@/i18n/messages';
import {text} from '@/components/operator/format';
import {partitionFleetAction,type FleetAction} from '@/lib/fleet-actions';
import type {ServerRow} from './model';
import {skillActionGroups} from '@/lib/skills/action-choices';

const t=messages.fleetManagement;
export type ManageMode='metadata'|'membership'|'maintenance'|'editMaintenance'|'end'|'cancelMaintenance'|'pause'|'resume'|'remove'|'update';
export function manageAction(mode:ManageMode,removal='delete'):FleetAction {
  return mode==='remove'?(removal==='archive'?'archive':'delete'):mode==='end'?'endMaintenance':mode;
}
/** Menu counts and confirmations partition exactly the same explicit selection. */
export function fleetMenuActions(rows:ServerRow[]) {
  const choices:{action:Exclude<FleetAction,'archive'|'delete'>|'remove'|'skill-actions';label:string;single?:boolean;separatorBefore?:boolean;next?:boolean}[]=[
    {action:'metadata',label:t.edit,single:true},{action:'update',label:t.updateNow},
    {action:'membership',label:t.changeGroups},{action:'maintenance',label:t.scheduleMaintenance},
    {action:'editMaintenance',label:t.editMaintenance},{action:'endMaintenance',label:t.endMaintenance},
    {action:'cancelMaintenance',label:t.cancelMaintenance},{action:'pause',label:t.pause},{action:'resume',label:t.resume},
    {action:'reconnect',label:t.replace,single:true},{action:'restore',label:t.restore,single:true},
    {action:'skill-actions',label:messages.skillActions.pickerMenu,separatorBefore:true,next:true},
    {action:'remove',label:t.remove,separatorBefore:true}
  ];
  return choices.flatMap(choice=>{
    if(choice.single&&rows.length!==1)return [];
    if(choice.action==='skill-actions')return skillActionGroups(rows).length?[choice]:[];
    const selection=partitionFleetAction((choice.action==='remove'?'delete':choice.action) as FleetAction,rows);
    if(!selection.eligible.length)return [];
    return [{...choice,label:selection.skipped.length?text(t.actionCount,{action:choice.label,count:selection.eligible.length}):choice.label}];
  });
}
