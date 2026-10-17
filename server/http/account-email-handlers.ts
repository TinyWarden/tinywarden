import {accountLogin} from '../access/operator';
import {enqueueRecovery,enqueueVerification} from '../account-email/requests';
import {verifyEmail,recoverPassword} from '../account-email/tickets';
import {sessionFromCookie,sessionCookie} from '../access/session';
import {handle,json,operatorPost,readJson,type HttpContext} from './response';
import {versioned} from '../validation';
import {fail} from '../errors';
export function accountMailOptions(r:Request,context?:HttpContext){return handle(async ctx=>json(200,{schema_version:1,enabled:!!ctx.config.accountMail}),context);}
export function requestVerification(r:Request,context?:HttpContext){return handle(async(ctx,id)=>{
 operatorPost(r,ctx.config);if(!ctx.config.accountMail)fail('account_email_unavailable',503);if(new URL(r.url).search)fail('invalid_request',400);
 const raw=versioned(await readJson(r,4096,true),['expected_revision','current_password']);await enqueueVerification(ctx.db,sessionFromCookie(r.headers.get('cookie')),raw,ctx.clock,id);return json(202,{schema_version:1,requested:true});
},context);}
export function confirmVerification(r:Request,context?:HttpContext){return handle(async(ctx,id)=>{
 operatorPost(r,ctx.config);if(new URL(r.url).search)fail('invalid_request',400);const raw=versioned(await readJson(r,1024,true),['token']);await verifyEmail(ctx.db,raw.token,ctx.clock,id);return json(200,{schema_version:1,verified:true});
},context);}
export function requestPasswordRecovery(r:Request,context?:HttpContext){return handle(async ctx=>{
 operatorPost(r,ctx.config);if(new URL(r.url).search)fail('invalid_request',400);const raw=versioned(await readJson(r,1024,true),['login']);const login=accountLogin(raw.login);if(ctx.config.accountMail)await enqueueRecovery(ctx.db,login,ctx.clock);
 return json(202,{schema_version:1,requested:true});
},context);}
export function confirmPasswordRecovery(r:Request,context?:HttpContext){return handle(async(ctx,id)=>{
 operatorPost(r,ctx.config);if(new URL(r.url).search)fail('invalid_request',400);const raw=versioned(await readJson(r,4096,true),['token','new_password']);await recoverPassword(ctx.db,raw.token,raw.new_password,ctx.clock,id);
 return json(200,{schema_version:1,changed:true},{'Set-Cookie':`${sessionCookie}=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`});
},context);}
