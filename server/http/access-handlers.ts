import {sessionFromCookie,sessionCookie} from '../access/session';
import {changePassword} from '../access/operator';
import {readAccess,readChoices,mutateAccess,accessOptions,type Entity,type Choice} from '../access/administration';
import {handle,json,empty,operatorPost,readJson,type HttpContext} from './response';
import {uuid,versioned} from '../validation';
import {fail} from '../errors';
export function operatorAccess(r:Request,entity:Entity,id?:string,action:'save'|'delete'|'password'='save',context?:HttpContext){return handle(async(ctx,requestId)=>{
 const cookie=sessionFromCookie(r.headers.get('cookie'));
 if(r.method==='GET')return json(200,{schema_version:1,...await readAccess(ctx.db,cookie,entity,accessOptions(new URL(r.url).search),ctx.clock,id)});
 operatorPost(r,ctx.config);if(new URL(r.url).search)fail('invalid_request',400);
 const fields=action==='delete'?['expected_revision']:action==='password'?['expected_revision','password']:!id?entity==='users'?['expected_revision','id','login','role','password']:['expected_revision','id','name']:entity==='users'?['expected_revision','role','disabled','add_hosts','remove_hosts','add_groups','remove_groups']:['expected_revision','name','add_hosts','remove_hosts','add_members','remove_members'];
 const input=await readJson(r,128*1024,true);if(entity==='users'&&input&&typeof input==='object'){
 if(action==='password'&&Object.hasOwn(input,'enable_local'))fields.push('enable_local');
 if(action==='save'&&Object.hasOwn(input,'display_name')){fields.push('display_name','email');if(id)fields.push('expected_profile_revision');}}
 const raw=versioned(input,fields);if(Object.hasOwn(raw,'enable_local')&&typeof raw.enable_local!=='boolean')fail('invalid_request',400);const result=await mutateAccess(ctx.db,cookie,entity,id??uuid(raw.id),!id?'create':action,raw,ctx.clock,requestId);
 return json(!id?201:200,{schema_version:1,result});
},context);}
export function operatorAccessChoices(r:Request,entity:Entity,id:string,kind:string,context?:HttpContext){return handle(async ctx=>{
 if(!['hosts','users','groups'].includes(kind))fail('invalid_request',400);return json(200,{schema_version:1,...await readChoices(ctx.db,sessionFromCookie(r.headers.get('cookie')),entity,id,kind as Choice,accessOptions(new URL(r.url).search),ctx.clock)});
},context);}
export function operatorPassword(r:Request,context?:HttpContext){return handle(async(ctx,requestId)=>{operatorPost(r,ctx.config);if(new URL(r.url).search)fail('invalid_request',400);
 const raw=versioned(await readJson(r,4096,true),['current_password','new_password']);await changePassword(ctx.db,sessionFromCookie(r.headers.get('cookie')),raw.current_password,raw.new_password,ctx.clock,requestId);
 return empty({'Set-Cookie':`${sessionCookie}=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`});},context);}
