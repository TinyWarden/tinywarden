import {readProfile,saveProfile} from '../access/profile';
import {sessionFromCookie} from '../access/session';
import {handle,json,operatorPost,readJson,type HttpContext} from './response';
import {versioned} from '../validation';
import {fail} from '../errors';
export function operatorProfile(r:Request,context?:HttpContext){return handle(async(ctx,id)=>{
 if(new URL(r.url).search)fail('invalid_request',400);const cookie=sessionFromCookie(r.headers.get('cookie'));
 if(r.method==='GET')return json(200,{schema_version:1,profile:{...await readProfile(ctx.db,cookie,ctx.clock),mail_enabled:!!ctx.config.accountMail}});
 operatorPost(r,ctx.config);const raw=versioned(await readJson(r,4096,true),['expected_revision','display_name','email']);
 return json(200,{schema_version:1,result:await saveProfile(ctx.db,cookie,raw,ctx.clock,id)});
},context);}
