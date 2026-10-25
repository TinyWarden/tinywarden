import {fail} from '../../errors';
import type {MaintenanceResult} from '../../../lib/maintenance/contracts';
import {validateUpgradePlan} from './validation';
export type PlanProvider={validate:(raw:unknown)=>{plan:Record<string,unknown>;has_changes:boolean;no_changes_result?:MaintenanceResult}};
/** Read-only validation of stored pre-SDK3 plan history. */
const providers:Readonly<Record<string,PlanProvider>>={
 'packages.upgrade_conservative.v1':{validate(raw){const plan=validateUpgradePlan(raw);return {plan,has_changes:plan.packages.length>0,no_changes_result:{effect:'indexes_changed',reason:null,local_verified:true,process_running:false,facts:{reboot_required:null,configuration_review:null,services_restart_required:null,kept_back:plan.kept_back.length,blocked_subjects:[],blocked_subject_count:0}}};}},
};
export function providerPlan(action:string,raw:unknown,registry=providers){
 const provider=registry[action];if(!provider)fail('maintenance_unsupported',409);
 return provider.validate(raw);
}
