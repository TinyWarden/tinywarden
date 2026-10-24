import {describe,expect,it} from 'vitest';
import fixture from '../fixtures/maintenance-recovery-v1.json';
import type {RecoveryScope} from '../../lib/maintenance/recovery';
import {recoveryAcceptance,recoveryFinalization} from '../../server/maintenance/recovery-validation';
import {maintenanceDigest} from '../../server/maintenance/validation';

describe('closed independent recovery wire contract',()=>{
 it('matches the agent fixture, including a granted but unconsumed orphan attempt',()=>{
  const scope=fixture.acceptance.scope as RecoveryScope;
  const accepted=recoveryAcceptance(fixture.acceptance,scope);
  expect(maintenanceDigest(accepted)).toBe(fixture.acceptance_sha256);
  expect(maintenanceDigest(recoveryFinalization(fixture.finalization,scope,accepted,fixture.acceptance_sha256))).toBe(fixture.finalization_sha256);
  expect(()=>recoveryAcceptance({...fixture.acceptance,execute:true},scope)).toThrow();
 });
});
