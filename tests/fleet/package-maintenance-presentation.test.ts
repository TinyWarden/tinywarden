import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MaintenanceResult} from '../../app/fleet/_components/maintenance-results';
import {maintenanceResultFacts,pendingMaintenance,type MaintenanceItem} from '../../app/fleet/_components/maintenance-model';

const item=(patch:Partial<MaintenanceItem>={}):MaintenanceItem=>({phase:'failed',process_running:false,
 result:{effect:'indexes_changed',local_verified:false,process_running:false,reason:'maintenance_archive_method',
 facts:{reboot_required:null,configuration_review:null,services_restart_required:null,kept_back:null}},...patch} as MaintenanceItem);

describe('maintenance result presentation',()=>{
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
});
