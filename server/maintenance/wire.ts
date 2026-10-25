import {legacyMaintenanceActions} from "../../lib/maintenance/legacy";
import {exactObject,uuid} from '../validation';
import {fail} from '../errors';
import {maintenanceLimits,registeredAction} from '../../lib/maintenance/policy';
import {maintenanceEventKinds,type MaintenanceAgentRequest,type MaintenanceResult,type ActionDefinition} from '../../lib/maintenance/contracts';
import {digestText} from './validation';
import {actionBinding,actionValue,packageReason} from './action-values';
import {actionPoll} from './action-readiness';

function integer(raw:unknown,min:number,max:number){if(!Number.isSafeInteger(raw)||Number(raw)<min||Number(raw)>max)fail('invalid_request',400);return raw as number;}
export function maintenanceResult(raw:unknown,definition:ActionDefinition):MaintenanceResult{
 if(definition.snapshot){
  const keys=['effect','reason','process_running','local_verified','facts'];
  const reasonPresent=!!raw&&typeof raw==='object'&&Object.hasOwn(raw,'reason_message');
  const v=exactObject(raw,[...keys,...(reasonPresent?['reason_message']:[])]);
  if(!['none','changed','unknown'].includes(String(v.effect))||typeof v.process_running!=='boolean'||typeof v.local_verified!=='boolean'||v.reason!==null&&(typeof v.reason!=='string'||!/^maintenance_[a-z_]{1,64}$/.test(v.reason)))fail('invalid_request',400);
  const emptyFailure=v.reason!==null&&!reasonPresent&&v.local_verified===false&&!!v.facts&&typeof v.facts==='object'&&!Array.isArray(v.facts)&&!Object.keys(v.facts).length;
  const facts=emptyFailure?{}:actionValue(definition.snapshot.schemas.result,JSON.stringify(v.facts),65536);
  const message=reasonPresent?packageReason(v.reason_message,definition.snapshot.catalog):undefined;
  if(message&&v.reason!=='maintenance_action_failed')fail('maintenance_result_invalid',409);
  return {effect:v.effect as MaintenanceResult['effect'],reason:v.reason as string|null,process_running:v.process_running,local_verified:v.local_verified,facts,...(message?{reason_message:message}:{})};
 }
 const v=exactObject(raw,['effect','reason','process_running','local_verified','facts']);
 if(!['none','indexes_changed','packages_changed','unknown'].includes(String(v.effect))||typeof v.process_running!=='boolean'||typeof v.local_verified!=='boolean')fail('invalid_request',400);
 if(v.reason!==null&&(typeof v.reason!=='string'||!/^maintenance_[a-z_]{1,64}$/.test(v.reason)))fail('invalid_request',400);
 const schema=definition.result_facts??{},data=exactObject(v.facts,Object.keys(schema)),facts:Record<string,boolean|number|string[]|null>={};
 for(const [key,kind] of Object.entries(schema)){
  const value=data[key];
  if(kind==='subjects'){
   if(!Array.isArray(value)||value.length>32||value.some(s=>typeof s!=='string'||s.length>288||! /^[A-Za-z0-9][A-Za-z0-9+_.:@/-]*$/.test(s)||s.includes('://')))fail('invalid_request',400);
  }else if(value!==null&&(kind==='boolean'?typeof value!=='boolean':!Number.isSafeInteger(value)||Number(value)<0))fail('invalid_request',400);
  facts[key]=value as boolean|number|string[]|null;
 }
 if(Array.isArray(facts.blocked_subjects)&&('blocked_subject_count' in facts)&&(typeof facts.blocked_subject_count!=='number'||facts.blocked_subject_count<facts.blocked_subjects.length))fail('invalid_request',400);
 return {effect:v.effect as MaintenanceResult['effect'],reason:v.reason as string|null,process_running:v.process_running,local_verified:v.local_verified,facts};
}
export function maintenanceAgentInput(raw:unknown):MaintenanceAgentRequest{
 if(Buffer.byteLength(JSON.stringify(raw))>maintenanceLimits.controlBytes)fail('invalid_request',400);
 const bound=!!raw&&typeof raw==='object'&&Object.hasOwn(raw,'binding');
 const v=exactObject(raw,['schema_version','host_id','agent_id','generation','job_id','sequence','kind','data',...(bound?['binding']:[])]);
 if((v.schema_version!==1&&v.schema_version!==2)||v.schema_version===1&&bound||!maintenanceEventKinds.includes(v.kind as never))fail('invalid_request',400);
 const scope={host_id:uuid(v.host_id),agent_id:uuid(v.agent_id),generation:integer(v.generation,1,Number.MAX_SAFE_INTEGER)};
 const job_id=v.job_id===null?null:uuid(v.job_id),sequence=integer(v.sequence,0,maintenanceLimits.events),kind=v.kind as MaintenanceAgentRequest['kind'];
 if(kind==='poll'?sequence!==0:!job_id||sequence===0)fail('invalid_request',400);
 if(v.schema_version===2&&!!job_id!==bound||!job_id&&bound)fail('invalid_request',400);
 let data:Record<string,unknown>;
 switch(kind){
  case 'poll':if(v.schema_version===2&&!job_id){data=actionPoll(v.data);break;}
   data=exactObject(v.data,[]);break;
  case 'preparing':case 'downloading':case 'ready':case 'cancelled':case 'start_declined':
   data=exactObject(v.data,[]);break;
  case 'prepared':{
   const x=exactObject(v.data,['provider_sha256','parts','age_ms']);
   data={provider_sha256:digestText(x.provider_sha256),parts:integer(x.parts,1,128),age_ms:integer(x.age_ms,0,maintenanceLimits.planSeconds*1000)};break;
  }
  case 'plan_chunk':{
   const x=exactObject(v.data,['provider_sha256','part','total','content']),total=integer(x.total,1,128),part=integer(x.part,0,total-1);
   if(typeof x.content!=='string'||x.content.length>43692||!x.content.length||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(x.content))fail('invalid_request',400);
   const bytes=Buffer.from(x.content,'base64');
   if(bytes.toString('base64')!==x.content||bytes.length>32768||(part<total-1&&bytes.length!==32768))fail('invalid_request',400);
   data={provider_sha256:digestText(x.provider_sha256),part,total,content:x.content};break;
  }
  default:
   // Provider-specific facts are validated after authenticated job/action resolution.
   data=exactObject(v.data,['result']);
 }
 return {schema_version:v.schema_version as 1|2,...scope,job_id,sequence,kind,data,...(bound?{binding:actionBinding(v.binding)}:{})};
}
export function maintenanceJobResult(raw:unknown,action:string|ActionDefinition){
 const definition=typeof action==='string'?registeredAction(legacyMaintenanceActions,action):action;if(!definition)fail('invalid_request',400);
 return maintenanceResult(raw,definition);
}
