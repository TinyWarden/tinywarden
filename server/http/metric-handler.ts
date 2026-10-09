import {sessionFromCookie} from "../access/session";
import {handle,json,type HttpContext} from "./response";
import {metricRequest} from "../skills/metrics/request";
import {readMetricHistory} from "../skills/metrics/read";
export function operatorMetricHistory(request:Request,host:string,installation:string,metric:string,context?:HttpContext){
  return handle(async ctx=>json(200,await readMetricHistory(ctx.db,sessionFromCookie(request.headers.get("cookie")),host,installation,metric,metricRequest(request.url),ctx.clock)),context);
}
