import {describe,expect,it} from 'vitest';
import {maintenanceInput} from '../../server/maintenance/validation';
import {providerPlan} from '../../server/maintenance/legacy/providers';
import {reviewDefinition} from '../../server/maintenance/legacy/review';
import fixture from '../fixtures/maintenance-v1.json';
describe('retained pre-SDK3 history',()=>{
 it('keeps old immutable plans readable through a historical adapter',()=>{expect(providerPlan('packages.upgrade_conservative.v1',fixture.plan).plan).toEqual(fixture.plan);expect(reviewDefinition('packages.upgrade_conservative.v1').tables.map(t=>t.id)).toEqual(['changes','kept_back']);});
 it('rejects the retired operator start shape',()=>{expect(()=>maintenanceInput({request_id:'11111111-1111-4111-8111-111111111111',action:'packages.upgrade_conservative.v1',targets:[]})).toThrow();});
});
