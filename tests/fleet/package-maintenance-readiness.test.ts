import {describe,expect,it} from 'vitest';
import {validateMaintenanceReadiness} from '../../server/maintenance/readiness';
import {validActionReadiness} from '../../lib/maintenance/readiness';
describe('legacy readiness remains historical',()=>{
 it('accepts the closed old report without inventing package grants',()=>{expect(validateMaintenanceReadiness({capability:'maintenance_jobs.v1',worker_ready:true,actions:[{id:'packages.refresh.v1',ready:true,missing:[]}]}).capability).toBe('maintenance_jobs.v1');});
 it('rejects executable or contradictory reports',()=>{for(const v of [{capability:'skill_actions.v1',worker_ready:true,actions:[{id:'packages.refresh.v1',ready:true,missing:[]}]},{capability:'maintenance_jobs.v1',worker_ready:true,actions:[],command:'apt upgrade'}])expect(()=>validateMaintenanceReadiness(v)).toThrow();expect(validActionReadiness({})).toBe(false);});
});
