import {handle,json,operatorPost,readJson,type HttpContext} from './response';
import {sessionFromCookie} from '../access/session';
import {versioned} from '../validation';
import {readRetentionSettings,saveRetentionSettings,retentionDaysInput} from '../data/retention-settings';
export function operatorRetention(request:Request,context?:HttpContext){return handle(async ctx=>{
 const cookie=sessionFromCookie(request.headers.get('cookie'));
 if(request.method==='GET')return json(200,{schema_version:1,...await readRetentionSettings(ctx.db,cookie,ctx.clock)});
 operatorPost(request,ctx.config);const {schema_version,...body}=versioned(await readJson(request),['request_id','expected_revision','days','confirmation']);void schema_version;
 return json(200,{schema_version:1,...await saveRetentionSettings(ctx.db,cookie,body,ctx.clock)});
},context);}
export function operatorRetentionPreview(request:Request,context?:HttpContext){return handle(async ctx=>{
 operatorPost(request,ctx.config);const body=versioned(await readJson(request),['days']);
 return json(200,{schema_version:1,...await readRetentionSettings(ctx.db,sessionFromCookie(request.headers.get('cookie')),ctx.clock,retentionDaysInput(body.days))});
},context);}
