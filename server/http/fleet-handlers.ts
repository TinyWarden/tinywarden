import { handle,json,operatorPost,readJson,type HttpContext } from './response';
import { sessionFromCookie } from '../access/session';
import { versioned,uuid } from '../validation';
import { fleetOptions,readFleet } from '../fleet/list';
import { fleetOperation,resumeOperation,readOperation,removalPreview,operationInput } from '../fleet/commands';
import { groupCommand } from '../fleet/management';
import { listFleetSetups } from '../fleet/setup';
import {retryPurge} from '../fleet/purge';
import {operationActivity,activityOptions} from '../fleet/activity';
import {readGroups,groupOptions} from '../fleet/groups';
import { fail } from '../errors';
const cookie=(r:Request)=>sessionFromCookie(r.headers.get('cookie'));
function payload(value:unknown,keys:string[]){const {schema_version,...body}=versioned(value,keys);void schema_version;return body;}
export function operatorFleet(r:Request,context?:HttpContext){return handle(async c=>json(200,{schema_version:1,...await readFleet(c.db,cookie(r),fleetOptions(new URL(r.url).search),c.clock)}),context);}
export function operatorFleetOperation(r:Request,context?:HttpContext){return handle(async c=>{
 operatorPost(r,c.config);const raw=payload(await readJson(r,65536),['request_id','kind','targets','values']);
 return json(200,{schema_version:1,...await fleetOperation(c.db,cookie(r),raw,c.clock)});
},context);}
export function operatorFleetOperationDetail(r:Request,id:string,context?:HttpContext){return handle(async c=>json(200,{schema_version:1,...await readOperation(c.db,cookie(r),id,c.clock)}),context);}
export function operatorFleetRemovalPreview(r:Request,context?:HttpContext){return handle(async c=>{
 operatorPost(r,c.config);const raw=payload(await readJson(r,32768),['kind','targets']);
 const parsed=operationInput({request_id:crypto.randomUUID(),kind:raw.kind,targets:raw.targets,values:{preview:'0'.repeat(64)}});
 return json(200,{schema_version:1,...await removalPreview(c.db,cookie(r),parsed.kind,parsed.targets,c.clock)});
},context);}
export function operatorFleetGroup(r:Request,id?:string,context?:HttpContext){return handle(async c=>{
 operatorPost(r,c.config);const raw=payload(await readJson(r),['request_id','action','id','expected_revision','name','description']);
 if(id&&uuid(raw.id)!==id)fail('invalid_request',400);
 return json(200,{schema_version:1,...await groupCommand(c.db,cookie(r),raw,c.clock)});
},context);}
export function operatorFleetSetups(r:Request,context?:HttpContext){return handle(async c=>json(200,{schema_version:1,...await listFleetSetups(c.db,cookie(r),c.clock,new URL(r.url).search)}),context);}
export function operatorFleetMetadata(r:Request,id:string,context?:HttpContext){return handle(async c=>{
 operatorPost(r,c.config);const raw=payload(await readJson(r),['request_id','expected_revision','label','description','owner_notes','groups','tags']);
 return json(200,{schema_version:1,...await fleetOperation(c.db,cookie(r),{request_id:raw.request_id,kind:'metadata',targets:[{id,revision:raw.expected_revision}],values:{label:raw.label,description:raw.description,owner_notes:raw.owner_notes,groups:raw.groups,tags:raw.tags}},c.clock)});
},context);}
export function operatorFleetLifecycle(r:Request,id:string,context?:HttpContext){return handle(async c=>{
 operatorPost(r,c.config);const raw=payload(await readJson(r),['request_id','expected_revision','action','preview']);
 if(!['pause','resume','archive','delete'].includes(String(raw.action)))fail('invalid_request',400);
 return json(200,{schema_version:1,...await fleetOperation(c.db,cookie(r),{request_id:raw.request_id,kind:raw.action,targets:[{id,revision:raw.expected_revision}],values:raw.action==='archive'||raw.action==='delete'?{preview:raw.preview}:{}},c.clock)});
},context);}
export function operatorFleetMaintenance(r:Request,id:string,context?:HttpContext){return handle(async c=>{
 operatorPost(r,c.config);const raw=payload(await readJson(r),['request_id','expected_revision','action','starts_at','ends_at']);
 return json(200,{schema_version:1,...await fleetOperation(c.db,cookie(r),{request_id:raw.request_id,kind:'maintenance',targets:[{id,revision:raw.expected_revision}],values:{action:raw.action,starts_at:raw.starts_at,ends_at:raw.ends_at}},c.clock)});
},context);}

export function operatorFleetOperations(r:Request,context?:HttpContext){return handle(async c=>json(200,{schema_version:1,...await operationActivity(c.db,cookie(r),activityOptions(new URL(r.url).search,'operations'),c.clock)}),context);}
export function operatorFleetPurgeRetry(r:Request,id:string,context?:HttpContext){return handle(async c=>{
 operatorPost(r,c.config);payload(await readJson(r),[]);
 return json(200,{schema_version:1,...await retryPurge(c.db,cookie(r),id,c.clock)});
},context);}

export function operatorFleetOperationResume(r:Request,id:string,context?:HttpContext){return handle(async c=>{operatorPost(r,c.config);payload(await readJson(r),[]);return json(200,{schema_version:1,...await resumeOperation(c.db,cookie(r),id,c.clock)});},context);}

export function operatorFleetGroups(r:Request,context?:HttpContext){return handle(async c=>json(200,{schema_version:1,...await readGroups(c.db,cookie(r),groupOptions(new URL(r.url).search),c.clock)}),context);}
