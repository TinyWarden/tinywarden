import {expect,it} from 'vitest';
import {partitionSkillAction,skillActionGroups,validSkillActionChoice,type SkillActionChoice} from '../../lib/skills/action-choices';
import {validMaintenanceMenu} from '../../app/fleet/_components/maintenance-model';
import {validFleet,type ServerRow} from '../../app/fleet/_components/model';
import {fleetMenuActions} from '../../app/fleet/_components/actions';

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const action=(extra:Partial<SkillActionChoice>={}):SkillActionChoice=>({id:id(1),installation_id:id(10),
 skill_id:'acme/archive',skill_name:'Archive',action_id:'archive.inspect',name:'Inspect archive',
 description:'Inspect saved archive metadata.',requires_approval:false,available:true,reason:null,...extra});
const host=(name:string,actions:SkillActionChoice[])=>({name,maintenance_jobs:{job:null,actions}});

it('groups unrelated installations and preserves declared action order and identities',()=>{
 const first=action(),next=action({id:id(2),action_id:'archive.verify',name:'Verify archive'});
 const other=action({id:id(3),installation_id:id(11),skill_id:'other/cache',skill_name:'Cache',action_id:'cache.inspect',name:first.name});
 const rows=[host('one',[first,next,other]),host('two',[first,next,other])],before=structuredClone(rows);
 const groups=skillActionGroups(rows);
 expect(groups.map(g=>g.skill_id)).toEqual(['acme/archive','other/cache']);
 expect(groups[0]!.actions.map(a=>[a.id,a.action_id])).toEqual([[first.id,first.action_id],[next.id,next.action_id]]);
 expect(groups[0]!.actions[0]).toMatchObject({description:first.description,eligible:2,total:2});
 expect(rows).toEqual(before);
});
it('retains exact cross-page targets while describing a partial eligible selection',()=>{
 const choice=action(),rows=[host('page-one',[choice]),host('page-two',[{...choice,available:false,reason:'maintenance_busy'}]),host('page-three',[])];
 expect(skillActionGroups(rows)[0]!.actions[0]).toMatchObject({eligible:1,total:3});
 expect(partitionSkillAction(choice.id,rows)).toEqual({eligible:[rows[0]],skipped:[
  {subject:rows[1],reason:'maintenance_busy'},{subject:rows[2],reason:'maintenance_agent_upgrade_required'}]});
});
it('omits unavailable actions and empty groups without changing unrelated choices',()=>{
 const ready=action(),blocked=action({id:id(2),installation_id:id(11),available:false,reason:'maintenance_resume_required'});
 expect(skillActionGroups([host('one',[ready,blocked])]).map(g=>g.id)).toEqual([ready.installation_id]);
 for(const reason of ['maintenance_inactive','maintenance_unrecognized','maintenance_readiness_unknown','maintenance_busy','maintenance_authority_revoked']){
  expect(skillActionGroups([host('one',[{...ready,available:false,reason}])])).toEqual([]);
 }
 expect(skillActionGroups([])).toEqual([]);
});
it('keeps identical skill and action labels separate by their identities',()=>{
 const a=action({skill_name:'Same',name:'Inspect'}),b=action({id:id(2),installation_id:id(11),skill_id:'other/archive',skill_name:'Same',name:'Inspect'});
 const groups=skillActionGroups([host('one',[b,a])]);
 expect(groups.map(g=>g.id)).toEqual([a.installation_id,b.installation_id]);
 expect(groups.map(g=>g.actions[0]!.id)).toEqual([a.id,b.id]);
});
it('refuses conflicting owner identity for a repeated grant',()=>{
 const a=action(),b=action({installation_id:id(11),skill_id:'other/archive'});
 expect(skillActionGroups([host('one',[a]),host('two',[b])])).toEqual([]);
});
it.each([
 {field:'name',value:''},{field:'name',value:' \t\n'},
 {field:'skill_name',value:''},{field:'skill_name',value:' \t\n'},
] as const)('keeps Fleet and unrelated actions usable with an admitted blank $field ($value)',({field,value})=>{
 const good=action(),blank=action({id:id(2),...(field==='skill_name'?{installation_id:id(11),skill_id:'other/archive'}:{}),[field]:value});
 for(const available of [true,false]){
  const menu={job:null,actions:[good,{...blank,available,reason:available?null:'maintenance_busy'}]};
  const row:ServerRow={host_id:id(20),agent_id:id(30),label:'Example host',reported_hostname:'example',description:'',owner_notes:'',
   os_id:'debian',os_version:'13',architecture:'amd64',agent_version:'0.0.23',revision:'1',monitoring_epoch:'1',lifecycle:'active',
   contact_state:'current',last_contact_at:'2026-10-27T00:00:00Z',health_state:'healthy',control_supported:true,control_applied:true,
   maintenance:null,groups:[],tags:[],maintenance_jobs:menu};
  const inventory={schema_version:1,as_of:'2026-10-27T00:00:00Z',hosts:[row],groups:[],counts:{active:1},total:1,next_cursor:null};
  expect(validFleet(inventory)).toBe(true);
  expect(validSkillActionChoice(blank)).toBe(false);
  expect(skillActionGroups(inventory.hosts).flatMap(g=>g.actions.map(a=>a.id))).toEqual([good.id]);
  expect(fleetMenuActions(inventory.hosts).map(a=>a.action)).toEqual(['metadata','membership','maintenance','pause','reconnect','skill-actions','remove']);
  menu.actions=[blank];
  expect(validFleet(inventory)).toBe(true);
  expect(skillActionGroups(inventory.hosts)).toEqual([]);
  expect(fleetMenuActions(inventory.hosts).map(a=>a.action)).toEqual(['metadata','membership','maintenance','pause','reconnect','remove']);
 }
});
it('accepts current metadata and rejects malformed or incomplete discovery data',()=>{
 const a=action();expect(validMaintenanceMenu({job:null,actions:[a]})).toBe(true);
 for(const bad of [{...a,id:a.action_id},{...a,installation_id:'bad'},{...a,skill_id:'Archive'},
  {...a,skill_name:null},{...a,name:null},{...a,description:'<script>bad</script>'},{...a,description:'x'.repeat(2049)},
  {...a,requires_approval:undefined},{id:a.id,available:true,reason:null}]){
  expect(validSkillActionChoice(bad)).toBe(false);
  expect(validMaintenanceMenu({job:null,actions:[bad]})).toBe(false);
 }
 expect(validMaintenanceMenu({job:null,actions:[a,a]})).toBe(false);
 expect(validSkillActionChoice({...a,description:'😀'.repeat(2048)})).toBe(true);
});
