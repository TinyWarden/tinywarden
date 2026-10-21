import {createFleetSetup} from "../fleet/setup";
import {exactObject} from "../validation";
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
  if(!token||!sameDigest(token.secret_digest,credential.digest)||token.revoked_at||token.consumed_at||token.target_agent_id&&! ["replace","restore"].includes(String(token.fleet_intent.purpose))||token.expires_at<=ctx.clock()||token.issued_at>ctx.clock())fail("unauthorized",401);
  return json(200,{schema_version:1,capabilities:[capability]});
},context);}
export function operatorSetup(request:Request,context?:HttpContext){return handle(async(ctx,requestId)=>{
  operatorPost(request,ctx.config);const value=await readJson(request,32768,true);
  if(value&&typeof value==="object"&&"schema_version"in value&&value.schema_version===2){
    const body=exactObject(value,["schema_version","request_id","mode","label","target_host_id","expected_revision","groups","tags"]);
    const {schema_version,...raw}=body;void schema_version;
    return json(201,{schema_version:2,...await createFleetSetup(ctx.db,sessionFromCookie(request.headers.get("cookie")),raw,ctx.config.origin,ctx.clock)});
  }
  const body=versioned(value,["request_id","label"]);
  const result=await issueToken(ctx.db,sessionFromCookie(request.headers.get("cookie")),issueInput({...body,target_agent_id:null}),ctx.clock,requestId);
  return json(201,{schema_version:1,token_id:result.token_id,setup_code:setupCode(ctx.config.origin,result.token),expires_at:result.expires_at});
},context);}
export function operatorAgentUpdates(request:Request,id?:string,context?:HttpContext){return handle(async(ctx,requestId)=>{
  if(new URL(request.url).search)fail("invalid_request",400);const cookie=sessionFromCookie(request.headers.get("cookie"));
  if(request.method==="GET")return json(200,{schema_version:1,...id?{as_of:ctx.clock().toISOString(),host_id:id,maintenance:await readHostMaintenance(ctx.db,cookie,id,ctx.clock)}:await readDefaults(ctx.db,cookie,ctx.clock)});
  operatorPost(request,ctx.config);const b=versioned(await readJson(request,2048,true),["request_id","expected_revision","automatic"]);
  return json(200,{schema_version:1,result:await savePolicy(ctx.db,cookie,{request_id:b.request_id,expected_revision:b.expected_revision,automatic:b.automatic},id,ctx.clock,requestId)});
},context);}

/** Target binding is checked before a managed agent stops or rotates credentials. */
export function agentReconnectIntent(request:Request,context?:HttpContext){return handle(async ctx=>{
 versioned(await readAgentJson(request,ctx,1024,true,true),[]);const credential=parseCredential('enrollment',bearer(request));
 const token=await ctx.db.selectFrom('enrollment_tokens').selectAll().where('id','=',credential.id).executeTakeFirst();
 if(!token||!sameDigest(token.secret_digest,credential.digest)||token.revoked_at||token.consumed_at||!token.target_agent_id||!['replace','restore'].includes(String(token.fleet_intent.purpose))||token.expires_at<=ctx.clock()||token.issued_at>ctx.clock())fail('unauthorized',401);
 const host=await ctx.db.selectFrom('agents as a').innerJoin('hosts as h','h.id','a.host_id').select(['a.id','a.current_generation','h.id as host_id','h.lifecycle','h.fleet_revision']).where('a.id','=',token.target_agent_id).executeTakeFirst();
 if(!host||token.expected_generation!==host.current_generation||host.lifecycle==='deleting'||token.fleet_intent.revision!==host.fleet_revision||token.fleet_intent.purpose==='restore'&&host.lifecycle!=='archived'||token.fleet_intent.purpose==='replace'&&host.lifecycle==='archived')fail('setup_scope_changed',409);
 return json(200,{schema_version:1,host_id:host.host_id,agent_id:host.id,generation:host.current_generation,purpose:token.fleet_intent.purpose});
},context);}
