import {handle,json,bearer,type HttpContext} from './response';
import {readAgentJson} from './agent-body';
import {sessionFromCookie} from '../access/session';
import {appendActionLogs,readActionLogs} from '../maintenance/action-logs';
import {fail} from '../errors';

export function agentActionLogs(request:Request,context?:HttpContext){return handle(async ctx=>{
 if(new URL(request.url).search)fail('invalid_request',400);
 const raw=await readAgentJson(request,ctx,160*1024,true);
 return json(200,await appendActionLogs(ctx.db,bearer(request),raw,ctx.clock));
},context);}
export function operatorActionLogs(request:Request,operation:string,job:string,context?:HttpContext){return handle(async ctx=>
 json(200,await readActionLogs(ctx.db,sessionFromCookie(request.headers.get('cookie')),operation,job,new URL(request.url).search,ctx.clock)),context);}
