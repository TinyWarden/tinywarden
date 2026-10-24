import {handle,json,bearer,operatorPost,readJson,type HttpContext} from './response';
import {versioned} from '../validation';
import {fail} from '../errors';
import {sessionFromCookie} from '../access/session';
import {admitRecovery,issueRecovery,revokeRecovery} from '../maintenance/recovery-authority';
import {recoverMaintenance} from '../maintenance/recovery';

export function operatorMaintenanceRecovery(request:Request,id:string,context?:HttpContext){return handle(async ctx=>{
 operatorPost(request,ctx.config);
 const input=versioned(await readJson(request,32768,true),['request_id','operation_id','job_id','revision']);
 if(input.operation_id!==id)fail('invalid_request',400);
 const {schema_version,...v}=input;void schema_version;
 return json(200,await issueRecovery(ctx.db,sessionFromCookie(request.headers.get('cookie')),v,ctx.clock));
},context);}
export function operatorRevokeRecovery(request:Request,id:string,context?:HttpContext){return handle(async ctx=>{
 operatorPost(request,ctx.config);const input=versioned(await readJson(request,1024,true),[]);void input;
 return json(200,{schema_version:1,...await revokeRecovery(ctx.db,sessionFromCookie(request.headers.get('cookie')),id,ctx.clock)});
},context);}
export function maintenanceRecoveryReceipt(request:Request,mode:string,context?:HttpContext){return handle(async ctx=>{
 if(!['describe','accept','finalize'].includes(mode)||new URL(request.url).search)fail('invalid_request',400);
 const token=bearer(request);await admitRecovery(ctx.db,token);
 const input=await readJson(request,65536,true,true);
 return json(200,await recoverMaintenance(ctx.db,token,mode as 'describe'|'accept'|'finalize',input,ctx.clock));
},context);}
