import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MaintenanceResult} from '../../app/fleet/_components/maintenance-results';
import {maintenanceResultFacts,pendingMaintenance,type MaintenanceItem} from '../../app/fleet/_components/maintenance-model';

const item=(patch:Partial<MaintenanceItem>={}):MaintenanceItem=>({phase:'failed',process_running:false,
 result:{effect:'indexes_changed',local_verified:false,process_running:false,reason:'maintenance_archive_method',
 facts:{reboot_required:null,configuration_review:null,services_restart_required:null,kept_back:null}},...patch} as MaintenanceItem);
const packageItem=(patch:Partial<MaintenanceItem>={}):MaintenanceItem=>item({phase:'no_changes',apply_attempt:null,
 presentation:{name:'Independent action',description:'Example',requires_approval:true,reason:null,facts:[
  {key:'outcome',label:'Outcome',kind:'text'},{key:'count',label:'Objects left',kind:'number'},
  {key:'review',label:'Review required',kind:'boolean'},{key:'missing',label:'Optional detail',kind:'text'}]},
 result:{effect:'changed',local_verified:true,process_running:false,reason:null,
  facts:{outcome:'no_changes',count:0,review:null}},...patch});

describe('maintenance result presentation',()=>{
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
