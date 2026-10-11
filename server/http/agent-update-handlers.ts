import {sessionFromCookie} from "../access/session";
import {readAgentJson} from "./agent-body";
import {bearer,handle,json,operatorPost,readJson,type HttpContext} from "./response";
import {versioned,parseCredential,sameDigest} from "../validation";
import {fail} from "../errors";
import {updatePolicy,platformStatus} from "../agent-updates/agent-api";
import {readDefaults,savePolicy} from "../agent-updates/policy";
import {readHostMaintenance} from "../agent-updates/status";
import {setupCode} from "../agent-updates/setup";
import {capability} from "../agent-updates/release";
import {issueInput,issueToken} from "../fleet/tokens";
export function agentUpdatePolicy(request:Request,context?:HttpContext){return handle(async ctx=>{
  const raw=await readAgentJson(request,ctx,4096,true);return json(200,await updatePolicy(ctx.db,bearer(request),raw,ctx.clock));
},context);}
export function agentPlatformStatus(request:Request,context?:HttpContext){return handle(async ctx=>{
  const raw=await readAgentJson(request,ctx,8192,true);return json(200,await platformStatus(ctx.db,bearer(request),raw,ctx.clock));
},context);}
export function agentSetup(request:Request,context?:HttpContext){return handle(async ctx=>{
  versioned(await readAgentJson(request,ctx,1024,true,true),[]);const credential=parseCredential("enrollment",bearer(request));
  const token=await ctx.db.selectFrom("enrollment_tokens").selectAll().where("id","=",credential.id).executeTakeFirst();
  if(!token||!sameDigest(token.secret_digest,credential.digest)||token.revoked_at||token.consumed_at||token.target_agent_id||token.expires_at<=ctx.clock()||token.issued_at>ctx.clock())fail("unauthorized",401);
  return json(200,{schema_version:1,capabilities:[capability]});
},context);}
export function operatorSetup(request:Request,context?:HttpContext){return handle(async(ctx,requestId)=>{
  operatorPost(request,ctx.config);const body=versioned(await readJson(request,2048,true),["request_id","label"]);
  const result=await issueToken(ctx.db,sessionFromCookie(request.headers.get("cookie")),issueInput({...body,target_agent_id:null}),ctx.clock,requestId);
  return json(201,{schema_version:1,token_id:result.token_id,setup_code:setupCode(ctx.config.origin,result.token),expires_at:result.expires_at});
},context);}
export function operatorAgentUpdates(request:Request,id?:string,context?:HttpContext){return handle(async(ctx,requestId)=>{
  if(new URL(request.url).search)fail("invalid_request",400);const cookie=sessionFromCookie(request.headers.get("cookie"));
  if(request.method==="GET")return json(200,{schema_version:1,...id?{as_of:ctx.clock().toISOString(),host_id:id,maintenance:await readHostMaintenance(ctx.db,cookie,id,ctx.clock)}:await readDefaults(ctx.db,cookie,ctx.clock)});
  operatorPost(request,ctx.config);const b=versioned(await readJson(request,2048,true),["request_id","expected_revision","automatic"]);
  return json(200,{schema_version:1,result:await savePolicy(ctx.db,cookie,{request_id:b.request_id,expected_revision:b.expected_revision,automatic:b.automatic},id,ctx.clock,requestId)});
},context);}
