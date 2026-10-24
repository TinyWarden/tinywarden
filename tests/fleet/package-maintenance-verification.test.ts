import {describe,it,expect} from 'vitest';
import {verificationRegression} from '../../server/maintenance/verification-runs';
import {sameVerificationCoverage} from '../../server/maintenance/verification';
import type {VerificationSnapshot} from '../../lib/maintenance/contracts';
const before:VerificationSnapshot={policy_sha256:'a'.repeat(64),not_configured:[],members:[{
 installation_id:'11111111-1111-4111-8111-111111111111',package_sha256:'b'.repeat(64),settings_revision:'1',scope_sha256:'c'.repeat(64),
 observation_id:'22222222-2222-4222-8222-222222222222',severity:'warning',subjects:[{collection:'resources',key:'existing',status:'warning'}]}]};
const after=()=>structuredClone(before);
describe('generic verification comparison',()=>{
 it('preserves pre-existing warnings while allowing healthy new resources',()=>{
  const next=after();next.members[0]!.observation_id='33333333-3333-4333-8333-333333333333';next.members[0]!.subjects.push({collection:'resources',key:'new',status:'healthy'});
  expect(verificationRegression(before,next)).toBe(false);expect(sameVerificationCoverage(before,next)).toBe(true);
 });
 it('blocks new warnings, worsened health and lost selected subjects',()=>{
  const next=after();next.members[0]!.subjects.push({collection:'resources',key:'new',status:'warning'});
  expect(verificationRegression(before,next)).toBe(true);
  const missing=after();missing.members[0]!.subjects=[];expect(verificationRegression(before,missing)).toBe(true);
  const healthy=after();healthy.members[0]!.severity='healthy';expect(verificationRegression(healthy,before)).toBe(true);
 });
 it('pins policy, check membership, content, settings and monitoring context',()=>{
  for(const change of [(s:VerificationSnapshot)=>{s.policy_sha256='d'.repeat(64);},(s:VerificationSnapshot)=>{s.members=[];},
   (s:VerificationSnapshot)=>{s.members[0]!.settings_revision='2';},(s:VerificationSnapshot)=>{s.members[0]!.scope_sha256='e'.repeat(64);},
   (s:VerificationSnapshot)=>{s.members[0]!.package_sha256='f'.repeat(64);},(s:VerificationSnapshot)=>{s.not_configured=['another'];}]){
   const next=after();change(next);expect(sameVerificationCoverage(before,next)).toBe(false);
  }
 });
});
