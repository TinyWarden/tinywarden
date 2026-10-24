import {describe,it,expect} from 'vitest';
import fixture from '../fixtures/maintenance-wire-v1.json';
import {maintenanceAgentInput,maintenanceJobResult,maintenanceResult} from '../../server/maintenance/wire';
import type {ActionDefinition} from '../../lib/maintenance/contracts';

describe('closed maintenance lane',()=>{
 it('accepts independent request/chunk fixtures without widening their scope',()=>{
  for(const request of [fixture.poll,fixture.prepared,fixture.chunk,fixture.ready])expect(maintenanceAgentInput(request)).toEqual(request);
 });
 it('rejects command fields, changed shape, counters and incomplete chunk bytes',()=>{
  for(const request of [{...fixture.ready,command:'apt-get'}, {...fixture.ready,sequence:0},
   {...fixture.ready,kind:'execute_shell'}, {...fixture.prepared,data:{...fixture.prepared.data,age_ms:1800001}},
   {...fixture.chunk,data:{...fixture.chunk.data,total:2}}, {...fixture.chunk,data:{...fixture.chunk.data,content:'ab=='}},
   {...fixture.poll,data:{job_id:fixture.ready.job_id}}])expect(()=>maintenanceAgentInput(request)).toThrow();
 });
 it('keeps provider facts closed and does not accept raw diagnostics',()=>{
  const result={effect:'packages_changed',reason:null,process_running:false,local_verified:true,
   facts:{reboot_required:false,configuration_review:null,services_restart_required:null,kept_back:2,blocked_subjects:[],blocked_subject_count:0}};
  expect(maintenanceJobResult(result,'packages.upgrade_conservative.v1')).toEqual(result);
  expect(()=>maintenanceJobResult({...result,facts:{...result.facts,stderr:'https://secret.invalid'}},'packages.upgrade_conservative.v1')).toThrow();
  expect(()=>maintenanceJobResult({...result,reason:'raw command output'},'packages.upgrade_conservative.v1')).toThrow();
 });
 it('admits another provider result schema without package branches',()=>{
  const action:ActionDefinition={id:'test.inspect.v1',provider_version:1,requires_approval:false,conflict_domain:'host_mutation',
   supported_platform:{os:'debian',version:'13',architecture:'amd64'},prerequisites:[],requires_monitoring:false,result_facts:{files_seen:'integer'}};
  expect(maintenanceResult({effect:'none',reason:null,process_running:false,local_verified:true,facts:{files_seen:2}},action).facts).toEqual({files_seen:2});
 });
});
