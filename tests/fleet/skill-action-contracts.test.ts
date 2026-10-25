import {describe,it,expect} from 'vitest';
import fixture from '../fixtures/action-package-v3.json';
import type {ActionSnapshot} from '../../lib/skills/action-types';
import {parseActionJSON,inspectActionJSON} from '../../lib/skills/action-json';
import {actionValue,actionBinding} from '../../server/maintenance/action-values';
import {admittedActionPlan} from '../../server/maintenance/action-plan';
import {actionPoll} from '../../server/maintenance/action-readiness';
import recoveryFixture from '../fixtures/maintenance-recovery-v1.json';
import {recoveryAcceptance,recoveryFinalization} from '../../server/maintenance/recovery-validation';
import {maintenanceDigest} from '../../server/maintenance/validation';
import {bytesDigest} from '../../server/maintenance/action-values';
import type {RecoveryScope} from '../../lib/maintenance/recovery';
import metadataFixture from '../fixtures/action-package-v3-metadata.json';
import {interpretPackage} from '../../server/skills/results/package-prepare';

const snapshot=fixture.snapshot as ActionSnapshot;
describe('admitted skill action contracts',()=>{
 it.each([[1,false,1],[2,true,2],[3,false,1],[3,true,2]] as const)('keeps SDK%s resource=%s on monitoring wire%s',async(sdk,resources,wire)=>{
  const manifest:Record<string,unknown>={...metadataFixture.manifest,sdk};
  if(resources)manifest.resource_collections={example:{}};else delete manifest.resource_collections;
  const bound={artifact:{metadata:{...metadataFixture,manifest}},assignment:{interval_seconds:60},state:undefined} as unknown as Parameters<typeof interpretPackage>[0];
  const now=new Date('2026-10-25T12:00:00.000Z');
  const run={run_id:'00000001-1111-4111-8111-111111111111',assignment_id:'00000002-1111-4111-8111-111111111111',run_sequence:1,
   started_at:now.toISOString(),finished_at:now.toISOString(),outcome:'execution_failed' as const,observation:null,...(wire===2?{protocol_version:2 as const}:{})};
  // A reported collection failure still traverses the real transport check without
  // invoking the native reducer or requiring a database. SDK is not wire version.
  await expect(interpretPackage(bound,run,now)).resolves.toMatchObject({outcome:'execution_failed',current:true});
  await expect(interpretPackage(bound,{...run,protocol_version:wire===1?2:1},now)).rejects.toMatchObject({code:'invalid_request'});
 });
 it('rejects duplicate keys at every depth without losing opaque domain bytes',()=>{
  for(const text of ['{"x":1,"x":2}','{"nested":{"x":1,"x":2}}','{"x":1} garbage','[1,]','{"x":NaN}'])expect(()=>parseActionJSON(text,1024)).toThrow();
  const raw='{"plan": {"amount":1.0,"word":"é😀<>&"}, "has_changes":true}';
  expect(inspectActionJSON(raw,1024).fields.plan).toBe('{"amount":1.0,"word":"é😀<>&"}');
 });
 it('uses the admitted schema rather than a built-in action identifier',()=>{
  expect(actionValue(snapshot.schemas.input,'{"complete":true}')).toEqual({complete:true});
  expect(()=>actionValue(snapshot.schemas.input,'{"complete":"true"}')).toThrow();
  expect(()=>actionValue(snapshot.schemas.input,'{"complete":true,"extra":1}')).toThrow();
  const copy=structuredClone(snapshot);copy.descriptor.id='another.publisher.action';
  expect(admittedActionPlan(copy,'{"has_changes":true,"plan":{"complete":true},"no_changes_result":null}').plan).toEqual({complete:true});
 });
 it('preserves fractional and Unicode plan values and refuses fake no-change success',()=>{
  const copy=structuredClone(snapshot);
  copy.schemas.plan={type:'object',additionalProperties:false,required:['value','text'],properties:{value:{type:'number',minimum:0,maximum:100},text:{type:'string',maxLength:20}}};
  const raw='{"has_changes":true,"plan":{"value":1.0,"text":"é😀"},"no_changes_result":null}';
  expect(admittedActionPlan(copy,raw).provider_json).toBe(raw);
  expect(()=>admittedActionPlan(snapshot,'{"has_changes":false,"plan":{"complete":true},"no_changes_result":null}')).toThrow();
  expect(()=>admittedActionPlan(snapshot,'{"has_changes":false,"plan":{"complete":true},"no_changes_result":{"effect":"none","reason":null,"local_verified":false,"process_running":false,"facts":{"complete":true},"receipt_json":null}}')).toThrow();
  expect(()=>actionValue({type:'object',additionalProperties:false,properties:{count:{type:'integer',minimum:0,maximum:10}}},'{"count":1.0}')).toThrow();
 });
 it('refuses partial bindings and unsupported readiness fields',()=>{
  expect(()=>actionBinding({installation_id:'anything'})).toThrow();
  expect(actionPoll({probe_cursor:null,worker_ready:true,origins:[],readiness:[]})).toEqual({probe_cursor:null,worker_ready:true,origins:[],readiness:[]});
  expect(()=>actionPoll({probe_cursor:null,worker_ready:true,origins:[],readiness:[],extra:true})).toThrow();
 });
 it('binds typed recovery to original bytes, package and protocol version',()=>{
  const old=recoveryFixture.acceptance.scope;
  const scope:RecoveryScope={...old,action:snapshot.descriptor.id,provider_version:snapshot.descriptor.version,binding:{installation_id:old.host_id,skill_id:snapshot.skill_id,content_sha256:fixture.provenance.content_sha256,
   action_id:snapshot.descriptor.id,action_version:1,descriptor_sha256:snapshot.descriptor_sha256,permission_revision:'1',settings_revision:'1',
   settings_sha256:bytesDigest('{}'),input_sha256:bytesDigest('{"complete":true}'),origin:{github_id:'123',owner_id:'456'}},
   input_json:'{"complete":true}',settings_json:'{}',archive:{sha256:'a'.repeat(64),size:4096}};
  const json='{"complete":true}',audit={...recoveryFixture.acceptance.audit,facts:{json,sha256:bytesDigest(json)}};
  const raw={...recoveryFixture.acceptance,schema_version:2,scope,audit};
  const accepted=recoveryAcceptance(raw,scope,snapshot),sha=maintenanceDigest(accepted);
  expect(accepted.audit.facts.json).toBe(json);
  expect(()=>recoveryAcceptance({...raw,schema_version:1},scope,snapshot)).toThrow();
  expect(()=>recoveryAcceptance({...raw,scope:{...scope,binding:{...scope.binding,permission_revision:'2'}}},scope,snapshot)).toThrow();
  expect(()=>recoveryAcceptance({...raw,audit:{...audit,facts:{json:'{"complete":false}',sha256:audit.facts.sha256}}},scope,snapshot)).toThrow();
  expect(()=>recoveryAcceptance(raw,scope)).toThrow();
  const final=recoveryFinalization({schema_version:2,recovery_id:scope.recovery_id,acceptance_sha256:sha,
   local_release:{job_id:scope.job_id,local_attempt:accepted.local_attempt,released:true,audit}},scope,accepted,sha,snapshot);
  expect(final.schema_version).toBe(2);expect(final.local_release.audit.facts).toEqual(audit.facts);
 });
});
