import {handle,json,operatorPost,readJson,type HttpContext} from './response';
import {sessionFromCookie} from '../access/session';
import {versioned} from '../validation';
import {readActionGrants,setActionGrant} from '../maintenance/action-grants';
import {fail} from '../errors';
export function operatorSkillActionGrants(request:Request,id:string,context?:HttpContext){return handle(async ctx=>{
 if(new URL(request.url).search)fail('invalid_request',400);
 const cookie=sessionFromCookie(request.headers.get('cookie'));
 if(request.method==='GET')return json(200,{schema_version:1,...await readActionGrants(ctx.db,cookie,id,ctx.clock)});
 operatorPost(request,ctx.config);
 const raw=versioned(await readJson(request,4096,true),['request_id','content_sha256','action_id','descriptor_sha256','expected_revision','enabled']);
 const {schema_version,...input}=raw;void schema_version;
 return json(200,{schema_version:1,...await setActionGrant(ctx.db,cookie,id,input,ctx.clock) as object});
},context);}
