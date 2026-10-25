import type {ActionSnapshot,SkillActionDescriptor} from '@/lib/skills/action-types';
import {packageText} from '@/lib/skills/package-types';
import {messages} from '@/i18n/messages';
import {FactGrid} from '@/components/playbook/data';
export type ActionPermissionDetails=Pick<ActionSnapshot,'catalog'|'skill_id'|'package_version'>&{descriptor:Pick<SkillActionDescriptor,'name_key'|'description_key'|'execution_class'>};
export function ActionPermissionReview({snapshot,confirmed,confirm,locked=false}:{snapshot:ActionPermissionDetails;confirmed:boolean;confirm:(v:boolean)=>void;locked?:boolean}){
 const t=messages.skillActions;
 return <><h3 className="tw-t-head">{packageText(snapshot.catalog,{key:snapshot.descriptor.name_key,params:{}})}</h3>
  <p>{packageText(snapshot.catalog,{key:snapshot.descriptor.description_key,params:{}})}</p>
  <FactGrid facts={[{key:'skill',label:messages.packageSkills.package,value:snapshot.skill_id},{key:'version',label:t.version,value:snapshot.package_version}]}/>
  <p>{snapshot.descriptor.execution_class==='host_admin'?t.hostAdmin:t.unprivileged}</p><p>{t.local}</p>
  <label className="tw-check"><input type="checkbox" checked={confirmed} disabled={locked} onChange={e=>confirm(e.target.checked)}/>{t.confirm}</label>
 </>;
}
