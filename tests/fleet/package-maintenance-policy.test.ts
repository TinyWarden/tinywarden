import {describe,expect,it} from 'vitest';
import {maintenanceActions,maintenanceLimits,registeredAction,maintenanceUnavailable,mayTransition,mayCancelImmediately,nextBulkTarget,fencesHost} from '../../lib/maintenance/policy';
import {type ActionDefinition,type MaintenancePhase} from '../../lib/maintenance/contracts';

describe('maintenance action policy',()=>{
 const ready={lifecycle:'active' as const,recognized:true,os:'debian',os_version:'13',architecture:'amd64',capabilities:maintenanceActions.map(a=>a.id),prerequisites:{'apt-get':true,'python3-apt':true},mutation_busy:false};
 it('requires intersection of built-in action, recognized capability and prerequisites',()=>{
  expect(registeredAction(maintenanceActions,'shell.exec')).toBeUndefined();
  for(const [delta,error] of [
   [{recognized:false},'maintenance_unrecognized'],[{os_version:'12'},'maintenance_platform'],
   [{capabilities:[]},'maintenance_agent_upgrade_required'],[{prerequisites:{}},'maintenance_prerequisites'],
   [{mutation_busy:true},'maintenance_busy'],[{lifecycle:'archived'},'maintenance_inactive'],
  ] as const)expect(maintenanceUnavailable(maintenanceActions[1],{...ready,...delta})).toBe(error);
  expect(maintenanceUnavailable(maintenanceActions[1],ready)).toBeNull();
 });
 it('allows paused refresh but requires active verification for upgrades',()=>{
  expect(maintenanceUnavailable(maintenanceActions[0],{...ready,lifecycle:'paused'})).toBeNull();
  expect(maintenanceUnavailable(maintenanceActions[1],{...ready,lifecycle:'paused'})).toBe('maintenance_resume_required');
 });
 it('can register a future test provider without APT-specific eligibility branches',()=>{
  const future:ActionDefinition<'fixture.verify.v1'>={...maintenanceActions[0],id:'fixture.verify.v1',prerequisites:['fixture-tool']};
  const definition=registeredAction([future],'fixture.verify.v1')!;
  expect(maintenanceUnavailable(definition,{...ready,capabilities:[future.id],prerequisites:{'fixture-tool':true}})).toBeNull();
 });
 it('retains fencing and safe cancellation around an ambiguous apply',()=>{
  expect(fencesHost({phase:'applying',attention:true,apply_attempt:'attempt'})).toBe(true);
  expect(fencesHost({phase:'failed',attention:true,apply_attempt:'attempt'})).toBe(true);
  expect(fencesHost({phase:'succeeded',attention:false,apply_attempt:'attempt'})).toBe(false);
  for(const phase of ['applying','verifying','failed','succeeded'] as MaintenancePhase[])expect(mayCancelImmediately(phase)).toBe(false);
  expect(mayCancelImmediately('awaiting_approval')).toBe(true);
  expect(mayTransition('applying','approved')).toBe(false);
  expect(mayTransition('failed','applying')).toBe(false);
  expect(mayTransition('verifying','succeeded')).toBe(true);
 });
 it('does not grant a later server until predecessors are verified and reviewed',()=>{
  const job=(id:string,phase:MaintenancePhase,attention=false)=>({id,phase,attention,cancel_requested:false});
  expect(nextBulkTarget([job('canary','approved'),job('next','approved')])).toBe('canary');
  for(const phase of ['applying','verifying','failed','expired','blocked','awaiting_approval'] as MaintenancePhase[])expect(nextBulkTarget([job('canary',phase),job('next','approved')])).toBeNull();
  expect(nextBulkTarget([job('canary','succeeded',true),job('next','approved')])).toBeNull();
  expect(nextBulkTarget([job('canary','succeeded'),job('next','approved')])).toBe('next');
  expect(maintenanceLimits.applyConcurrency).toBe(1);
 });
});
