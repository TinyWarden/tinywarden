import { sessionFromCookie } from "../access/session";
import { dashboardOptions } from "../fleet/dashboard-model";
import { readDashboard } from "../fleet/dashboard";
import { historyOptions, readHistory } from "../history/reads";
import { handle, json, operatorPost, readJson, type HttpContext } from "./response";
import {versioned} from "../validation";
import {fail} from "../errors";
import {readDashboardLayout,saveDashboardLayout} from "../fleet/dashboard-layout";

export function operatorDashboardLayout(request:Request,context?:HttpContext){return handle(async ctx=>{
  if(new URL(request.url).search)fail("invalid_request",400);
  const cookie=sessionFromCookie(request.headers.get("cookie"));
  if(request.method==="GET")return json(200,{schema_version:1,...await readDashboardLayout(ctx.db,cookie,ctx.clock)});
  operatorPost(request,ctx.config);
  const b=versioned(await readJson(request,16384,true),["request_id","expected_revision","layout"]);
  return json(200,{schema_version:1,result:await saveDashboardLayout(ctx.db,cookie,{request_id:b.request_id,expected_revision:b.expected_revision,layout:b.layout},ctx.clock)});
},context);}

export function operatorDashboard(request: Request, context?: HttpContext) {
  return handle(async (ctx) => {
    const view = await readDashboard(ctx.db, sessionFromCookie(request.headers.get("cookie")),
      dashboardOptions(new URL(request.url).search), ctx.clock);
    return json(200, { schema_version: 1, ...view });
  }, context);
}
export function operatorHistory(request: Request, context?: HttpContext) {
  return handle(async (ctx) => {
    const view = await readHistory(ctx.db, sessionFromCookie(request.headers.get("cookie")),
      historyOptions(new URL(request.url).search), ctx.clock);
    return json(200, { schema_version: 1, ...view });
  }, context);
}
