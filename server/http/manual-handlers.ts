import { readAgentJson } from "./agent-body";
import{sessionFromCookie}from"../access/session";
import{fail}from"../errors";
import{versioned}from"../validation";
import{handle,json,operatorPost,readJson,bearer,type HttpContext}from"./response";
import{requestManualRun}from"../skills/manual/operator";
import{startManualRun}from"../skills/manual/agent";
export function operatorManualRun(r:Request,host:string,id:string,context?:HttpContext){return handle(async ctx=>{
  operatorPost(r,ctx.config);if(new URL(r.url).search)fail("invalid_request",400);
  const b=versioned(await readJson(r,4096,true),["request_id","expected_context"]);
  if(typeof b.request_id!=="string"||typeof b.expected_context!=="string")fail("invalid_request",400);
  return json(200,{schema_version:1,result:await requestManualRun(ctx.db,sessionFromCookie(r.headers.get("cookie")),host,id,
    {request_id:b.request_id,expected_context:b.expected_context},ctx.clock)});
},context);}
export function agentManualStart(r:Request,context?:HttpContext){return handle(async ctx=>{
  if(new URL(r.url).search)fail("invalid_request",400);
  const b=versioned(await readAgentJson(r,ctx,4096,true),["manual_request_id","assignment_id","run_id","run_sequence"]);
  return json(200,{schema_version:1,...await startManualRun(ctx.db,bearer(r),{manual_request_id:b.manual_request_id,
    assignment_id:b.assignment_id,run_id:b.run_id,run_sequence:b.run_sequence},ctx.clock)});
},context);}
