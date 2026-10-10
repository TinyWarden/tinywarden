import { readAgentJson } from "./agent-body";
import { sessionFromCookie } from "../access/session";
import { baselineKey } from "../skills/legacy/shared/recipe";
import { baselineDefinitionInput, baselinePolicyInput, readBaselineDefinition, readBaselinePolicy,
  updateBaselineDefinition, setBaselinePolicy } from "../skills/settings/baseline";
import { baselineFetchInput } from "../skills/assignments/baseline-delivery";
import { fetchBaselineAssignments } from "../skills/assignments/baseline";
import { acceptBaselineRun, baselineRunInput } from "../skills/results/baseline-runs";
import { readBaselineHealth } from "../skills/results/baseline-health";
import { fail } from "../errors";
import { hostPolicyBody } from "../skills/settings/field-overrides";
import { versioned } from "../validation";
import { bearer, handle, json, operatorPost, readJson, type HttpContext } from "./response";

function noQuery(r: Request) { if (new URL(r.url).search) fail("invalid_request", 400); }
export function operatorBaselineDefinition(r: Request, rawKey: string, context?: HttpContext) {
  return handle(async (ctx) => {
    noQuery(r);
    const result = await readBaselineDefinition(ctx.db, sessionFromCookie(r.headers.get("cookie")), baselineKey(rawKey), ctx.clock);
    return json(200, { schema_version: 1, ...result });
  }, context);
}
export function operatorUpdateBaselineDefinition(r: Request, rawKey: string, context?: HttpContext) {
  return handle(async (ctx, id) => {
    operatorPost(r, ctx.config); noQuery(r);
    const key = baselineKey(rawKey), body = versioned(await readJson(r, 16 * 1024, true),
      ["request_id", "expected_revision", "interval_seconds", "timeout_seconds", "package_mode"]);
    const result = await updateBaselineDefinition(ctx.db, sessionFromCookie(r.headers.get("cookie")), key, baselineDefinitionInput(key, body), ctx.clock, id);
    return json(200, { schema_version: 1, ...result });
  }, context);
}
export function operatorBaselinePolicy(r: Request, host: string, rawKey: string, context?: HttpContext) {
  return handle(async (ctx) => {
    noQuery(r);
    const result = await readBaselinePolicy(ctx.db, sessionFromCookie(r.headers.get("cookie")), host, baselineKey(rawKey), ctx.clock);
    return json(200, { schema_version: 2, ...result });
  }, context);
}
export function operatorSetBaselinePolicy(r: Request, host: string, rawKey: string, context?: HttpContext) {
  return handle(async (ctx, id) => {
    operatorPost(r, ctx.config); noQuery(r);
    const key = baselineKey(rawKey), value = await readJson(r, 16 * 1024, true);
    const parsed = hostPolicyBody(value, ["interval_seconds", "timeout_seconds", "package_mode"]);
    const result = await setBaselinePolicy(ctx.db, sessionFromCookie(r.headers.get("cookie")), host, key, baselinePolicyInput(key, parsed), ctx.clock, id);
    return json(200, { schema_version: 2, ...result });
  }, context);
}
export function agentBaselineAssignments(r: Request, context?: HttpContext) {
  return handle(async (ctx) => {
    noQuery(r);
    const body = versioned(await readAgentJson(r,ctx,16*1024,true), ["agent_version", "capabilities", "known_assignments"]);
    const result = await fetchBaselineAssignments(ctx.db, bearer(r), baselineFetchInput(body), ctx.clock);
    return json(200, { schema_version: 1, ...result });
  }, context);
}
export function agentBaselineRun(r: Request, context?: HttpContext) {
  return handle(async (ctx) => {
    noQuery(r);
    const body = versioned(await readAgentJson(r,ctx,32*1024,true), ["run_id", "run_sequence", "assignment_id", "started_at", "finished_at", "dropped_runs", "observation"]);
    const result = await acceptBaselineRun(ctx.db, bearer(r), baselineRunInput(body), ctx.clock);
    return json(200, { schema_version: 1, ...result });
  }, context);
}
export function operatorBaselines(r: Request, host: string, context?: HttpContext) {
  return handle(async (ctx) => {
    noQuery(r);
    const result = await readBaselineHealth(ctx.db, sessionFromCookie(r.headers.get("cookie")), host, ctx.clock);
    return json(200, { schema_version: 1, ...result });
  }, context);
}
