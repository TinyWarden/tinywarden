import { sessionFromCookie } from "../access/session";
import { dashboardOptions } from "../fleet/dashboard-model";
import { readDashboard } from "../fleet/dashboard";
import { historyOptions, readHistory } from "../history/reads";
import { handle, json, type HttpContext } from "./response";

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
