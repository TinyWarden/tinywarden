import {describe,expect,it} from 'vitest';
import fixture from '../fixtures/maintenance-v1.json';
import {maintenanceDigest,maintenanceInput,validateUpgradePlan} from '../../server/maintenance/validation';
describe('closed maintenance contract',()=>{
 it('matches independently generated Python canonical plan digest',()=>{
  const plan=validateUpgradePlan(fixture.plan);
  expect(maintenanceDigest(plan)).toBe(fixture.provider_sha256);
  const reversed=Object.fromEntries(Object.entries(plan).reverse());
  expect(maintenanceDigest(reversed)).toBe(fixture.provider_sha256);
 });
 it('encodes Unicode context keys using the same canonical ASCII escapes as Python',()=>{
  expect(maintenanceDigest({value:'€😀'})).toBe('52cc4ccb5b5f3d7de18165b3f3b8bbe362c8aab44dbf76ffdc1243298b8ffd6b');
 });
 it('refuses widened package content, partial totals and duplicate identities',()=>{
  for(const raw of [
   {...fixture.plan,command:'apt upgrade'}, {...fixture.plan,download_bytes:101},
   {...fixture.plan,packages:[...fixture.plan.packages,...fixture.plan.packages]},
   {...fixture.plan,packages:[{...fixture.plan.packages[0],name:'example; reboot'}]},
   {...fixture.plan,packages:[{...fixture.plan.packages[0],archive_sha256:'unverified'}]},
   {...fixture.plan,provider_version:2},
  ])expect(()=>validateUpgradePlan(raw)).toThrow();
 });
 it('pins order and explicit target revisions without an arbitrary command channel',()=>{
  const input={request_id:'b45435bd-40e9-405b-aa57-302e2fe20c82',action:'packages.refresh.v1',targets:[{id:'f4ef5823-a828-48e3-a99f-7d008716999a',revision:'1'}]};
  expect(maintenanceInput(input)).toEqual(input);
  for(const raw of [{...input,command:'apt update'},{...input,action:'shell.exec'},{...input,targets:[]},{...input,targets:[...input.targets,...input.targets]}])expect(()=>maintenanceInput(raw)).toThrow();
 });
});
