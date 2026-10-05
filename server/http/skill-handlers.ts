import { sessionFromCookie } from "../access/session";
import { readSkills, setSkillEnabled, skillKey, enablementInput } from "../skills/catalog/controls";
import { fail } from "../errors";
import { versioned } from "../validation";
import { handle, json, operatorPost, readJson, type HttpContext } from "./response";
const noQuery = (r: Request) => { if (new URL(r.url).search) fail("invalid_request", 400); };
export function operatorSkills(r: Request, context?: HttpContext) {
  return handle(async (ctx) => { noQuery(r); return json(200, { schema_version: 1,
    ...await readSkills(ctx.db, sessionFromCookie(r.headers.get("cookie")), ctx.clock) }); }, context);
}
export function operatorSkillEnabled(r: Request, key: string, context?: HttpContext) {
  return handle(async (ctx, id) => {
    operatorPost(r, ctx.config); noQuery(r);
    const body = versioned(await readJson(r, 4096, true), ["request_id", "expected_enablement_version", "enabled"]);
    const result = await setSkillEnabled(ctx.db, sessionFromCookie(r.headers.get("cookie")), skillKey(key), enablementInput(body), ctx.clock, id);
    return json(200, { schema_version: 1, ...result });
  }, context);
}
