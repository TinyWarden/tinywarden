import {sessionFromCookie} from "../access/session";
import {handle,json,type HttpContext} from "./response";
import {readingRequest} from "../skills/results/reading-request";
import {readCollectionHistory} from "../skills/results/reading-history";
export function operatorCollectionHistory(request:Request,host:string,installation:string,context?:HttpContext){
  return handle(async ctx=>json(200,await readCollectionHistory(ctx.db,sessionFromCookie(request.headers.get("cookie")),host,installation,readingRequest(request.url),ctx.clock)),context);
}
