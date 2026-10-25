import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
describe('package action ownership',()=>{
 it('keeps domain IDs and native plan schemas outside new-work owners',()=>{
  for(const file of ['lib/maintenance/contracts.ts','lib/maintenance/policy.ts','server/maintenance/plans.ts','server/maintenance/action-plan.ts','server/maintenance/operations.ts']){
   const source=readFileSync(file,'utf8');for(const token of ['packages.refresh.v1','packages.upgrade_conservative.v1','validateUpgradePlan(','providerPlan('])expect(source,file).not.toContain(token);
  }
 });
});
