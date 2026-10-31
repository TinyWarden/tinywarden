import {readFileSync,readdirSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {sameVerificationCoverage} from '../../server/maintenance/verification';
import type {VerificationSnapshot} from '../../lib/maintenance/contracts';
const local:VerificationSnapshot={mode:'local',policy_sha256:'a'.repeat(64),members:[],not_configured:[]};
describe('action verification boundary',()=>{
 it('accepts only the same action-local scope, never historical monitoring membership',()=>{
  expect(sameVerificationCoverage(local,structuredClone(local))).toBe(true);
  expect(sameVerificationCoverage(local,{...local,policy_sha256:'b'.repeat(64)})).toBe(false);
  expect(sameVerificationCoverage(local,{policy_sha256:local.policy_sha256,members:[],not_configured:[]})).toBe(false);
  expect(sameVerificationCoverage(local,{...local,not_configured:['another-skill']})).toBe(false);
 });
 it('keeps monitoring projections and collection orchestration outside action execution',()=>{
  for(const name of readdirSync('server/maintenance').filter(n=>n.endsWith('.ts'))){
   const source=readFileSync('server/maintenance/'+name,'utf8');
   expect(source,name).not.toMatch(/(?:packageProjections|enqueueManualRun|verificationRegression|maintenance_health_regression)/);
  }
 });
});
