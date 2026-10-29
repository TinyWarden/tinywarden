import {describe,expect,it,vi} from 'vitest';
import {createElement,type ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MaintenanceResult} from '../../app/fleet/_components/maintenance-results';
import {maintenanceResultFacts,pendingMaintenance,maintenanceSettled,maintenanceInterval,validProgressContext,type MaintenanceRead,type MaintenanceItem} from '../../app/fleet/_components/maintenance-model';
import {MaintenanceDialog} from '../../app/fleet/_components/maintenance-dialog';
import {PlanReview} from '../../app/fleet/_components/plan-review';
import type {ActionProgressContext} from '../../lib/maintenance/presentation';

const progressRead=vi.hoisted(()=>({value:null as unknown,busy:false,failed:false,expired:false,outdated:false}));
vi.mock('@/components/operator/use-operator-read',()=>({useOperatorRead:(path:string)=>({...progressRead,value:path.endsWith('/logs')?null:progressRead.value,reload:async()=>true})}));
vi.mock('../../app/fleet/_components/fields',()=>({
 FleetDialog:({children,actions,leading}:{children:ReactNode;actions?:ReactNode;leading?:ReactNode})=>createElement('section',null,children,leading,actions),
 CommandNotice:()=>null
}));

const item=(patch:Partial<MaintenanceItem>={}):MaintenanceItem=>({phase:'failed',process_running:false,
 result:{effect:'indexes_changed',local_verified:false,process_running:false,reason:'maintenance_archive_method',
 facts:{reboot_required:null,configuration_review:null,services_restart_required:null,kept_back:null}},...patch} as MaintenanceItem);
const packageItem=(patch:Partial<MaintenanceItem>={}):MaintenanceItem=>item({phase:'no_changes',apply_attempt:null,
 presentation:{name:'Independent action',description:'Example',requires_approval:true,reason:null,facts:[
  {key:'outcome',label:'Outcome',kind:'text'},{key:'count',label:'Objects left',kind:'number'},
  {key:'review',label:'Review required',kind:'boolean'},{key:'missing',label:'Optional detail',kind:'text'}]},
 result:{effect:'changed',local_verified:true,process_running:false,reason:null,
  facts:{outcome:'no_changes',count:0,review:null}},...patch});

describe('plan review presentation',()=>{
 const description='Archive rotation may restart the selected service.';
 function render({inline=true,busy=false,failed=false,page=1}={}){
  progressRead.value={label:'Example server',phase:'awaiting_approval',as_of:'2026-10-28T12:00:00Z',
   expires_at:'2026-10-28T12:30:00Z',attention:false,description,package_defined:true,facts:[],
   tables:[{id:'objects',label:'Affected objects',count:60,columns:[{key:'name',label:'Object'}]}],
   table:'objects',page,page_size:25,total:60,rows:[{name:'example-object'}],
   coverage:{configured:0,warnings:0,not_configured:0}};
  Object.assign(progressRead,{busy,failed});
  try{return renderToStaticMarkup(createElement(PlanReview,{operation:'operation',id:'plan',inline}));}
  finally{Object.assign(progressRead,{busy:false,failed:false});}
 }
 it('retains the saved action effects once in inline and full review',()=>{
  for(const inline of [true,false])expect(render({inline}).split(description)).toHaveLength(2);
 });
 it('keeps current-page pagination quiet during background revalidation',()=>{
  const html=render({busy:true});
  expect(html).not.toContain('tw-spinner');
  expect(html.match(/<button[^>]*aria-label="Next page"[^>]*>/)?.[0]).not.toContain('disabled');
 });
 it('retains pagination loading for a requested page or an unusable read',()=>{
  for(const state of [{busy:true,page:2},{busy:true,failed:true}]){
   const html=render(state);
   expect(html).toContain('tw-spinner');
   expect(html.match(/<button[^>]*aria-label="Next page"[^>]*>/)?.[0]).toContain('disabled');
  }
 });
});

describe('compact progress recovery access',()=>{
 function render(patch:Partial<MaintenanceItem>={},initial?:ActionProgressContext){
  const target=packageItem({host_id:'host',job_id:'job',label:'Example server',phase:'preparing',state:'pending',
   attention:false,recovery_pending:false,cancel_requested:true,delivered_at:'2026-10-27T12:00:00Z',
   presentation:{name:'Independent action',description:'Example',requires_approval:false,reason:null,facts:[]},
   result:null,...patch});
  progressRead.value={as_of:'2026-10-27T12:01:00Z',operation:{id:'operation',action:'example.action'},items:[target],approvals:[],recoveries:[]};
  return renderToStaticMarkup(createElement(MaintenanceDialog,{id:'operation',close:()=>{},...(initial?{initial}:{})}));
 }
 it.each(['maintenance_cancelled','maintenance_expired'])('preserves recovery while delivered work awaits acknowledgement: %s',reason=>{
  const html=render({reason});
  expect(html).toContain('Cancellation requested; waiting for a safe checkpoint.');
  expect(html).toContain('Read-only recovery');
  expect(html).not.toContain('<table');
 });
 it('does not offer recovery for undelivered or completed work without attention',()=>{
  expect(render({delivered_at:null})).not.toContain('Read-only recovery');
  expect(render({phase:'succeeded',state:'completed',cancel_requested:false})).not.toContain('Read-only recovery');
 });
 it('lets authoritative approval metadata override a stale advisory compact-view hint',()=>{
  const hint={name:'Old name',single:true,server:'Example server',presentation:{...packageItem().presentation!,requires_approval:false}};
  const html=render({presentation:{...hint.presentation,requires_approval:true}},hint);
  expect(html).toContain('tw-dialog--action-review');
  expect(html).not.toContain('Approve and run'); // Preparation is not approval readiness.
 });
});

describe('maintenance result presentation',()=>{
 it('stops polling only after all work, native processes, attention and recovery have settled',()=>{
  const done=packageItem({job_id:'job',phase:'succeeded',state:'completed',attention:false,recovery_pending:false,process_running:false});
  const operation=(i:MaintenanceItem)=>({items:[i]} as MaintenanceRead);
  expect(maintenanceInterval(null)).toBe(2000);expect(maintenanceInterval(operation(done))).toBe(Infinity);
  for(const patch of [{state:'pending'},{phase:'preparing'},{attention:true},{recovery_pending:true},{process_running:true},
   {result:{...done.result!,process_running:true}}] as Partial<MaintenanceItem>[]){
   expect(maintenanceSettled(operation({...done,...patch}))).toBe(false);
   expect(maintenanceInterval(operation({...done,...patch}))).toBe(2000);
  }
  expect(maintenanceSettled({items:[]} as unknown as MaintenanceRead)).toBe(false);
  expect(maintenanceSettled(operation({...done,state:'failed',job_id:null,result:null}))).toBe(true);
 });
 it('validates reusable progress context without granting execution authority',()=>{
  const context={name:'Independent action',single:true,server:'Example server',presentation:packageItem().presentation};
  expect(validProgressContext(context)).toBe(true);
  for(const patch of [{single:'yes'},{name:42},{server:{}},{presentation:{facts:[]}}])expect(validProgressContext({...context,...patch})).toBe(false);
 });
 it('shows retained generic preparation changes after a later failure',()=>{
  const value=item({presentation:{name:'Example action',description:'Example',requires_approval:true,facts:[],reason:null}});
  value.result!.effect='changed';
  const html=renderToStaticMarkup(createElement(MaintenanceResult,{item:value}));
  expect(html).toContain('Changes reported');
  expect(html).not.toContain('No changes reported');
 });
 it('shows the index effect after failed preparation without post-install unknown facts',()=>{
  const html=renderToStaticMarkup(createElement(MaintenanceResult,{item:item()}));
  expect(html).toContain('Package lists may have changed');
  expect(html).not.toContain('Reboot required');expect(html).not.toContain('Unknown');
  expect(maintenanceResultFacts(item())).toEqual([]);
 });
 it('preserves uncertainty after package changes or an uncertain native transaction',()=>{
  for(const effect of ['packages_changed','unknown'] as const){
   const value=item();value.result!.effect=effect;
   expect(maintenanceResultFacts(value)).toHaveLength(4);
   expect(renderToStaticMarkup(createElement(MaintenanceResult,{item:value}))).toContain('Unknown');
  }
 });
 it('preserves reported facts, including zero and false, before installation',()=>{
  const value=item();value.result!.facts={kept_back:0,reboot_required:false};
  expect(maintenanceResultFacts(value).map(f=>f.value)).toEqual([false,0]);
 });
 it('keeps unknown facts visible while a native process is still running',()=>{
  expect(maintenanceResultFacts({...item(),process_running:true})).toHaveLength(4);
 });
 it('does not suggest preparation is still running after a terminal result or while awaiting approval',()=>{
  for(const phase of ['failed','blocked','expired','cancelled','no_changes','succeeded','awaiting_approval'] as const)
   expect(pendingMaintenance([item({phase})])).toBe(false);
  expect(pendingMaintenance([item({phase:'preparing'}),item()])).toBe(true);
 });
 it('shows a readable no-change outcome and known zero without unavailable installation facts',()=>{
  const value=packageItem(),html=renderToStaticMarkup(createElement(MaintenanceResult,{item:value}));
  expect(html).toContain('Nothing to upgrade');expect(html).not.toContain('no_changes');
  expect(html).toContain('Objects left');expect(html).not.toContain('Review required');
  expect(html).not.toContain('Optional detail');expect(html).not.toContain('Unknown');
  expect(maintenanceResultFacts(value).map(f=>f.value)).toEqual(['no_changes',0]);
 });
 it('keeps missing package-defined facts visible for uncertain, running or started actions',()=>{
  const original=packageItem();
  for(const value of [
   {...original,phase:'failed',result:{...original.result!,effect:'unknown'}},
   {...original,phase:'verifying',apply_attempt:'started'},
   {...original,phase:'applying',process_running:true},
   {...original,phase:'applying',result:{...original.result!,process_running:true}},
  ] as MaintenanceItem[]){
   expect(maintenanceResultFacts(value)).toHaveLength(4);
   expect(renderToStaticMarkup(createElement(MaintenanceResult,{item:value}))).toContain('Unknown');
  }
 });
 it('preserves false and opaque result text from unrelated actions',()=>{
  const value=packageItem({phase:'succeeded'});value.result!.facts={outcome:'no_changes',count:0,review:false};
  const html=renderToStaticMarkup(createElement(MaintenanceResult,{item:value}));
  expect(html).toContain('no_changes');expect(html).toContain('Review required');
  expect(maintenanceResultFacts(value).map(f=>f.value)).toEqual(['no_changes',0,false]);
 });
});
