import {handle,json,bearer,operatorPost,readJson,type HttpContext} from './response';
import {readAgentJson} from './agent-body';
import {versioned} from '../validation';
import {fail} from '../errors';
import {sessionFromCookie} from '../access/session';
import {agentMaintenance} from '../maintenance/agent';
import {createMaintenanceOperation,readMaintenanceOperation} from '../maintenance/operations';
import {approveMaintenance} from '../maintenance/approvals';
import {controlMaintenance,settleMaintenanceOperation} from '../maintenance/control';
import {readMaintenancePlan} from '../maintenance/review';
import {downloadActionPackage} from '../maintenance/package-download';

export function agentMaintenancePackage(request:Request,id:string,context?:HttpContext){return handle(async ctx=>{
 if(new URL(request.url).search)fail('invalid_request',400);
 return downloadActionPackage(ctx.db,bearer(request),id,ctx.clock);
},context);}

export function operatorMaintenancePlan(request:Request,operation:string,plan:string,context?:HttpContext){return handle(async ctx=>
 json(200,{schema_version:1,...await readMaintenancePlan(ctx.db,sessionFromCookie(request.headers.get('cookie')),operation,plan,new URL(request.url).search,ctx.clock)}),context);}

export function agentMaintenanceJobs(request:Request,context?:HttpContext){return handle(async ctx=>{
 const raw=await readAgentJson(request,ctx,65536,true);
 return json(200,await agentMaintenance(ctx.db,bearer(request),raw,ctx.clock));
},context);}
export function operatorMaintenance(request:Request,id?:string,context?:HttpContext){return handle(async ctx=>{
 if(new URL(request.url).search)fail('invalid_request',400);
 const cookie=sessionFromCookie(request.headers.get('cookie'));
 if(request.method==='GET'){
  if(!id)fail('not_found',404);
  await settleMaintenanceOperation(ctx.db,cookie,id,ctx.clock);
  return json(200,{schema_version:1,...await readMaintenanceOperation(ctx.db,cookie,id,ctx.clock)});
 }
 operatorPost(request,ctx.config);
 const raw=versioned(await readJson(request,131072,true),['request_id','grant_id','content_sha256','descriptor_sha256','permission_revision','input_json','targets']);
 const {schema_version,...input}=raw;void schema_version;
 return json(201,{schema_version:1,...await createMaintenanceOperation(ctx.db,cookie,input,ctx.clock)});
},context);}
export function operatorMaintenanceApproval(request:Request,context?:HttpContext){return handle(async ctx=>{
 operatorPost(request,ctx.config);const raw=versioned(await readJson(request,32768,true),['request_id','operation_id','targets']);
 const {schema_version,...input}=raw;void schema_version;
 return json(200,{schema_version:1,...await approveMaintenance(ctx.db,sessionFromCookie(request.headers.get('cookie')),input,ctx.clock)});
},context);}
export function operatorMaintenanceControl(request:Request,context?:HttpContext){return handle(async ctx=>{
 operatorPost(request,ctx.config);const raw=versioned(await readJson(request,32768,true),['request_id','operation_id','action','targets']);
 const {schema_version,...input}=raw;void schema_version;
 return json(200,{schema_version:1,...await controlMaintenance(ctx.db,sessionFromCookie(request.headers.get('cookie')),input,ctx.clock)});
},context);}
