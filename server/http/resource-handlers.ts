import {handle,json,type HttpContext} from "./response";
import {sessionFromCookie} from "../access/session";
import {readResources} from "../skills/resources/inventory";
import {fail} from "../errors";
export function operatorResources(r:Request,host:string,id:string,collection:string,context?:HttpContext){
 return handle(async ctx=>{
  const query=new URL(r.url).searchParams;
  if([...query.keys()].some(k=>!['q','monitored','page','snapshot','selector'].includes(k)||query.getAll(k).length!==1)||query.has('selector')&&query.get('selector')!=='true'||query.has('monitored')&&!['true','false'].includes(query.get('monitored')!)||query.has('page')&&!/^[1-9][0-9]{0,2}$/.test(query.get('page')!))fail('invalid_request',400);
  return json(200,await readResources(ctx.db,sessionFromCookie(r.headers.get('cookie')),host,id,collection,{q:query.get('q')??'',monitored:query.get('monitored')==='true',page:Number(query.get('page')??1),selector:query.get('selector')==='true',...(query.has('snapshot')?{snapshot:query.get('snapshot')!}:{})},ctx.clock));
 },context);
}
