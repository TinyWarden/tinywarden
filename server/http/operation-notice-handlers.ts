import {handle,json,operatorPost,readJson,type HttpContext} from './response';
import {versioned} from '../validation';
import {sessionFromCookie} from '../access/session';
import {dismissOperationNotice} from '../fleet/operation-notices';
import {fail} from '../errors';

export function operatorDismissOperationNotice(request:Request,context?:HttpContext){return handle(async ctx=>{
 if(new URL(request.url).search)fail('invalid_request',400);
 operatorPost(request,ctx.config);
 const {schema_version,...input}=versioned(await readJson(request,1024,true),['job_id','expected_updated_at']);void schema_version;
 return json(200,{schema_version:1,...await dismissOperationNotice(ctx.db,sessionFromCookie(request.headers.get('cookie')),input,ctx.clock)});
},context);}
