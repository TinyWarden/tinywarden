import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {useServerActions} from '../../components/skills/server-actions';
import type {SkillActionChoice,SkillActionTarget} from '../../lib/skills/action-choices';
import {dismissibleOperationNotice,operationActivityState,type SkillOperationSummary} from '../../lib/maintenance/operation-summary';
import {ActionActivity} from '../../components/playbook/action-activity';
import {scopeMaintenanceOperation,type MaintenanceRead} from '../../app/fleet/_components/maintenance-model';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const action=(n:number,installation=10):SkillActionChoice=>({id:id(n),installation_id:id(installation),skill_id:'acme/archive',skill_name:'Archive',
 action_id:`archive.inspect${n}`,name:`Inspect archive ${n}`,description:'Inspect saved data.',requires_approval:false,available:true,reason:null});
function Screen({target,usable=true,installation=10}:{target:SkillActionTarget|undefined;usable?:boolean;installation?:number}){
 const controller=useServerActions({target,usable,reload:async()=>{}}),controls=controller.actions(id(installation));return createElement('div',null,controls?.menu,controls?.activity);
}
function render(actions:SkillActionChoice[],usable=true,installation=10){return renderToStaticMarkup(createElement(Screen,{target:{host_id:id(20),label:'One server',revision:'1',maintenance_jobs:{job:null,actions}},usable,installation}));}
it('renders every declared eligible action for the exact installation without a skill registry',()=>{
 const html=render([action(1),action(2),action(3,11)]);
 expect(html).toContain('Inspect archive 1');expect(html).toContain('Inspect archive 2');expect(html).not.toContain('Inspect archive 3');
 expect(render([action(3,11)],true,11)).toContain('Inspect archive 3');
 expect(html.match(/role="menuitem"/g)).toHaveLength(2);expect(html).toContain('aria-label="Operations"');expect(html).not.toContain('tw-skill-actionbar');
});
const saved=(phase:SkillOperationSummary['phase']='succeeded',installation=10):SkillOperationSummary=>({job_id:id(30),operation_id:id(31),host_id:id(20),installation_id:id(installation),phase,attention:false,recovery_pending:false,created_at:'2026-10-30T12:00:00Z',updated_at:'2026-10-30T12:01:00Z',completed_at:'2026-10-30T12:01:00Z',progress:{name:'Inspect archive',single:true,server:'One server',presentation:null}});
it('renders saved outcomes after a fresh mount without relying on a local launch',()=>{
 const target:SkillActionTarget={host_id:id(20),label:'One server',revision:'1',maintenance_jobs:{job:null,actions:[]},latest_operations:[saved()]};
 const html=renderToStaticMarkup(createElement(Screen,{target}));
 expect(html).toContain('Completed');expect(html).toContain('View result');expect(html).toContain('Recent results');expect(html).toContain('2026-10-30T12:01:00Z');expect(html).not.toContain('View progress');
 expect(renderToStaticMarkup(createElement(Screen,{target,installation:11}))).toBe('<div></div>');
 expect(renderToStaticMarkup(createElement(Screen,{target:{...target,latest_operations:[{...saved(),host_id:id(21)}]}}))).toBe('<div></div>');
});
it('maps review, failure and unresolved work independently of completed success',()=>{
 expect(operationActivityState(saved('awaiting_approval'))).toBe('review');
 expect(operationActivityState(saved('failed'))).toBe('failed');
 expect(operationActivityState({...saved('failed'),attention:true})).toBe('verification');
 expect(operationActivityState({...saved('succeeded'),recovery_pending:true})).toBe('verification');
 expect(operationActivityState(saved('applying'))).toBe('running');
});
it('restricts a saved bulk operation and every possible target to its exact job',()=>{
 const value={items:[{job_id:id(30),host_id:id(20)},{job_id:id(32),host_id:id(21)}],recoveries:[{job_id:id(30)},{job_id:id(32)}],approvals:[{targets:[{job_id:id(30)},{job_id:id(32)}]}]} as MaintenanceRead;
 const scoped=scopeMaintenanceOperation(value,id(30));expect(scoped.items.map(i=>i.host_id)).toEqual([id(20)]);
 expect(scoped.recoveries).toHaveLength(1);expect(scoped.approvals.flatMap(a=>a.targets).map(t=>t.job_id)).toEqual([id(30)]);
 expect(value.items).toHaveLength(2);expect(scopeMaintenanceOperation(value,id(99)).items).toEqual([]);
});
it('omits empty, unavailable, stale and unapproved controls instead of exposing disabled actions',()=>{
 expect(render([])).toBe('<div></div>');const stale=render([action(1)],false);
 expect(stale).not.toContain('Inspect archive 1');expect(stale).toContain('Retry loading actions');expect(stale).not.toContain('disabled=');
 const blocked=render([{...action(1),available:false,reason:'maintenance_busy'}]);
 expect(blocked).not.toContain('Inspect archive 1');expect(blocked).toContain('Check action availability');expect(blocked).not.toContain('disabled=');
 expect(renderToStaticMarkup(createElement(Screen,{target:undefined}))).toBe('<div></div>');
 expect(render([action(1),{...action(2),name:' '}])).not.toContain('Inspect archive 2');
});
it('keeps eligible actions after a notice is dismissed and offers read recovery without changing work',()=>{
 const target:SkillActionTarget={host_id:id(20),label:'One server',revision:'1',maintenance_jobs:{job:null,actions:[action(1),action(2)]},latest_operations:[{...saved(),notice_dismissed:true}]};
 const html=renderToStaticMarkup(createElement(Screen,{target}));
 expect(html).toContain('Inspect archive 1');expect(html).toContain('Inspect archive 2');expect(html).toContain('Recent results');expect(html).not.toContain('View result');
 const failed=renderToStaticMarkup(createElement(Screen,{target,usable:false}));
 expect(failed).toContain('Could not confirm which actions can run');expect(failed).toContain('Retry loading actions');expect(failed).toContain('Recent results');expect(failed).not.toContain('Inspect archive 1');
 expect(renderToStaticMarkup(createElement(Screen,{target,usable:false,installation:11}))).toBe('<div></div>');
});
it('supports one or many actions and escapes long catalogue labels in shared controls',()=>{
 expect(render([action(1)]).match(/role="menuitem"/g)).toHaveLength(1);
 const actions=Array.from({length:16},(_,i)=>action(i+1));
 actions[0]!.name='<img src=x onerror=alert(1)> '+ 'Review archive details '.repeat(10);
 // Admitted metadata rejects markup; an ordinary long label remains usable.
 expect(render(actions)).not.toContain('<img');actions[0]!.name='Review archive details '.repeat(10);
 expect(render(actions).match(/role="menuitem"/g)).toHaveLength(16);
});
it('reopens saved work only in its owning installation and omits conflicting actions',()=>{
 const target:SkillActionTarget={host_id:id(20),label:'One server',revision:'1',maintenance_jobs:{actions:[{...action(1),available:false,reason:'maintenance_busy'}],
  job:{id:id(30),operation_id:id(31),phase:'applying',attention:false,apply_attempt:id(32),recovery_pending:false,installation_id:id(10),
   progress:{name:'Inspect archive',single:true,server:'One server',presentation:null}}}};
 const html=renderToStaticMarkup(createElement(Screen,{target}));expect(html).toContain('View progress');expect(html).toContain('Inspect archive');
 expect(html).not.toContain('disabled=');expect(html).not.toContain('Some actions are temporarily unavailable');
 expect(renderToStaticMarkup(createElement(Screen,{target,installation:11}))).toBe('<div></div>');
});

it('supplies Playbook scope when a shared dialog is mounted directly under an unscoped server page',async()=>{
 const {SettingsDialog}=await import('../../components/playbook/skill');
 const html=renderToStaticMarkup(createElement('main',null,createElement(SettingsDialog,{title:'Independent action',meta:'Fleet',help:'One server',close:()=>{},children:'Saved result'})));
 expect(html).toMatch(/^<main><div class="tw-ui tw-dialog-scope"><dialog /);
 expect(html).toContain('class="tw-dialog');expect(html).toContain('Saved result');
});

it('shows the shared verification entry for an unrelated skill without pretending the failed task is running',()=>{
 const target:SkillActionTarget={host_id:id(20),label:'One server',revision:'1',maintenance_jobs:{actions:[],
  job:{id:id(30),operation_id:id(31),phase:'failed',attention:true,apply_attempt:id(32),recovery_pending:false,installation_id:id(10),progress:{name:'Archive refresh',single:true,server:'One server',presentation:null}}}};
 const html=renderToStaticMarkup(createElement(Screen,{target}));
 expect(html).toContain('Verification required');expect(html).toContain('Verify and unlock');expect(html).not.toContain('View progress');expect(html).not.toContain('tw-row-status--running');
});

it('offers dismissal only for known settled notices and protects active/review/uncertain work',()=>{
 for(const phase of ['succeeded','no_changes','failed','cancelled'] as const)expect(dismissibleOperationNotice(saved(phase))).toBe(true);
 for(const job of [saved('applying'),saved('awaiting_approval'),{...saved('failed'),attention:true},{...saved('succeeded'),recovery_pending:true}]){
  expect(dismissibleOperationNotice(job)).toBe(false);
  expect(renderToStaticMarkup(createElement(ActionActivity,{name:'Independent check',receipt:true,state:operationActivityState(job),onDismiss:()=>{}}))).not.toContain('Dismiss result notice');
 }
 expect(renderToStaticMarkup(createElement(ActionActivity,{name:'Independent check',receipt:true,state:'completed',onDismiss:()=>{}}))).toContain('aria-label="Dismiss result notice"');
});
