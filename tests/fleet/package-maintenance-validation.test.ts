import {describe,expect,it} from 'vitest';
import fixture from '../fixtures/maintenance-v1.json';
import {maintenanceDigest,maintenanceInput} from '../../server/maintenance/validation';
import {validateUpgradePlan} from '../../server/maintenance/legacy/validation';
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
 it('rejects the retired start shape and arbitrary command input',()=>{
  expect(()=>maintenanceInput({request_id:'11111111-1111-4111-8111-111111111111',action:'packages.refresh.v1',targets:[]})).toThrow();
  expect(()=>maintenanceInput({command:'apt upgrade'})).toThrow();
 });
});
