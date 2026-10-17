import {beginOidc,finishOidc,publicOidc,oidcCookie} from '../access/oidc';
import {readOidcSettings,saveOidcSettings} from '../access/oidc-configuration';
import {unlinkIdentity} from '../access/profile';
import {sessionCookie,cookieFlags,sessionFromCookie} from '../access/session';
import {handle,json,operatorPost,readJson,type HttpContext} from './response';
import {versioned} from '../validation';
import {fail} from '../errors';
const temporary=(value:string,max=600)=>`${oidcCookie}=${value}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=${max}`;
function redirect(location:string,headers?:HeadersInit){return new Response(null,{status:303,headers:{Location:location,'Cache-Control':'no-store','Referrer-Policy':'no-referrer',...headers}});}
export function oidcOptions(r:Request,context?:HttpContext){return handle(async ctx=>json(200,{schema_version:1,provider:await publicOidc(ctx.db,ctx.config.oidcSecret)}),context);}
export function oidcStart(r:Request,context?:HttpContext){return handle(async(ctx,id)=>{
 operatorPost(r,ctx.config);if(new URL(r.url).search)fail('invalid_request',400);const raw=versioned(await readJson(r,1024,true),['intent']);
 if(raw.intent!=='login'&&raw.intent!=='link')fail('invalid_request',400);
 const started=await beginOidc(ctx.db,ctx.config.origin,ctx.config.oidcSecret,raw.intent,raw.intent==='link'?sessionFromCookie(r.headers.get('cookie')):undefined,ctx.clock,id);
 return json(200,{schema_version:1,url:started.url},{'Set-Cookie':temporary(started.browser)});
},context);}
export function oidcCallback(r:Request,context?:HttpContext){return handle(async(ctx,id)=>{
 const cookies=(r.headers.get('cookie')??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(oidcCookie+'='));
 try{if(cookies.length!==1)fail('oidc_failed',400);
  // Next's request URL may reflect the listener behind the HTTPS proxy. The
  // callback's origin is the configured origin; redirect destinations are fixed.
  const url=new URL(r.url);url.protocol=new URL(ctx.config.origin).protocol;url.host=new URL(ctx.config.origin).host;
  const result=await finishOidc(ctx.db,url,cookies[0]!.slice(oidcCookie.length+1),ctx.config.origin,ctx.config.oidcSecret,ctx.clock,id);
  const response=redirect(result.intent==='link'?'/login/complete?intent=link':'/login/complete?intent=login');
  response.headers.append('Set-Cookie',temporary('',0));if(result.session)response.headers.append('Set-Cookie',`${sessionCookie}=${result.session}; ${cookieFlags}`);
  return response;
 }catch{return redirect('/login?oidc=failed',{'Set-Cookie':temporary('',0)});}
},context);}
export function oidcSettings(r:Request,context?:HttpContext){return handle(async(ctx,id)=>{
 if(new URL(r.url).search)fail('invalid_request',400);const cookie=sessionFromCookie(r.headers.get('cookie'));
 if(r.method==='GET')return json(200,{schema_version:1,...await readOidcSettings(ctx.db,cookie,ctx.clock,ctx.config.origin,ctx.config.oidcSecret)});
 operatorPost(r,ctx.config);const raw=versioned(await readJson(r,64*1024,true),['expected_revision','label','issuer','client_id','enabled','groups_claim','mappings']);
 return json(200,{schema_version:1,result:await saveOidcSettings(ctx.db,cookie,raw,ctx.clock,ctx.config.oidcSecret,id)});
},context);}
export function oidcUnlink(r:Request,context?:HttpContext){return handle(async(ctx,id)=>{
 operatorPost(r,ctx.config);if(new URL(r.url).search)fail('invalid_request',400);const raw=versioned(await readJson(r,1024,true),['expected_revision','identity_id']);
 await unlinkIdentity(ctx.db,sessionFromCookie(r.headers.get('cookie')),raw,ctx.clock,id);return json(200,{schema_version:1});
},context);}
