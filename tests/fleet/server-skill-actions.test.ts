import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {useServerActions} from '../../components/skills/server-actions';
import type {SkillActionChoice,SkillActionTarget} from '../../lib/skills/action-choices';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const action=(n:number,installation=10):SkillActionChoice=>({id:id(n),installation_id:id(installation),skill_id:'acme/archive',skill_name:'Archive',
 action_id:`archive.inspect${n}`,name:`Inspect archive ${n}`,description:'Inspect saved data.',requires_approval:false,available:true,reason:null});
function Screen({target,usable=true,installation=10}:{target:SkillActionTarget|undefined;usable?:boolean;installation?:number}){
 const controller=useServerActions({target,usable,reload:async()=>{}});return controller.actions(id(installation));
}
function render(actions:SkillActionChoice[],usable=true,installation=10){return renderToStaticMarkup(createElement(Screen,{target:{host_id:id(20),label:'One server',revision:'1',maintenance_jobs:{job:null,actions}},usable,installation}));}
it('renders every declared eligible action for the exact installation without a skill registry',()=>{
 const html=render([action(1),action(2),action(3,11)]);
 expect(html).toContain('Inspect archive 1');expect(html).toContain('Inspect archive 2');expect(html).not.toContain('Inspect archive 3');
 expect(render([action(3,11)],true,11)).toContain('Inspect archive 3');
 expect(html.match(/<button/g)).toHaveLength(2);expect(html).toContain('tw-skill-actionbar');
});
it('omits empty, unavailable, stale and unapproved controls instead of exposing disabled actions',()=>{
 expect(render([])).toBe('');expect(render([action(1)],false)).toBe('');
 expect(render([{...action(1),available:false,reason:'maintenance_busy'}])).toBe('');
 expect(renderToStaticMarkup(createElement(Screen,{target:undefined}))).toBe('');
 expect(render([action(1),{...action(2),name:' '}])).not.toContain('Inspect archive 2');
});
it('supports one or many actions and escapes long catalogue labels in shared controls',()=>{
 expect(render([action(1)]).match(/<button/g)).toHaveLength(1);
 const actions=Array.from({length:16},(_,i)=>action(i+1));
 actions[0]!.name='<img src=x onerror=alert(1)> '+ 'Review archive details '.repeat(10);
 // Admitted metadata rejects markup; an ordinary long label remains usable.
 expect(render(actions)).not.toContain('<img');actions[0]!.name='Review archive details '.repeat(10);
 expect(render(actions).match(/<button/g)).toHaveLength(16);
});
it('reopens saved work only in its owning installation and omits conflicting actions',()=>{
 const target:SkillActionTarget={host_id:id(20),label:'One server',revision:'1',maintenance_jobs:{actions:[{...action(1),available:false,reason:'maintenance_busy'}],
  job:{id:id(30),operation_id:id(31),phase:'applying',attention:false,apply_attempt:id(32),recovery_pending:false,installation_id:id(10),
   progress:{name:'Inspect archive',single:true,server:'One server',presentation:null}}}};
 const html=renderToStaticMarkup(createElement(Screen,{target}));expect(html).toContain('View progress');expect(html).toContain('Inspect archive');
 expect(html).not.toContain('disabled=');expect(html).not.toContain('Some actions are temporarily unavailable');
 expect(renderToStaticMarkup(createElement(Screen,{target,installation:11}))).toBe('');
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
