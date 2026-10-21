import { controlInput, controlPoll } from '../fleet/control';
import { versioned } from '../validation';
import { readAgentJson } from './agent-body';
import { bearer, handle, json, type HttpContext } from './response';
export function agentMonitoringControl(request:Request,context?:HttpContext){
  return handle(async ctx=>{
    const raw=versioned(await readAgentJson(request,ctx),['capabilities','applied']);
    return json(200,{schema_version:1,...await controlPoll(ctx.db,bearer(request),controlInput(raw),ctx.clock)});
  },context);
}
