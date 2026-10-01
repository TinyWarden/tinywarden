import { login } from "../access/operator";
import { logout, sessionCookie, cookieFlags, sessionFromCookie, sessionStatus } from "../access/session";
import { enroll, enrollmentInput } from "../fleet/enrollment";
import { heartbeat, heartbeatInput } from "../fleet/heartbeat";
import { detailHost, listHosts, listOptions } from "../fleet/inventory";
import { revokeAgent } from "../fleet/revocation";
import { issueToken, issueInput, revokeToken } from "../fleet/tokens";
import { versioned } from "../validation";
import { fail } from "../errors";
import { readDiskDefinition, readHostDiskPolicy, setHostDiskPolicy,
  updateDiskDefinition } from "../checks/policy";
import { fetchCheckAssignments } from "../checks/assignments";
import { assignmentInput, definitionInput, policyInput } from "../checks/values";
import { acceptDiskRun, diskRunInput } from "../checks/runs";
import { bearer, empty, handle, json, operatorPost, readJson, type HttpContext } from "./response";

export function operatorLogin(request: Request, context?: HttpContext): Promise<Response> {
  return handle(async (ctx, requestId) => {
    operatorPost(request, ctx.config);
    const body = versioned(await readJson(request), ["login", "password"]);
    const cookie = await login(ctx.db, body.login, body.password, ctx.clock, requestId);
    return json(200, { schema_version: 1, authenticated: true },
      { "Set-Cookie": `${sessionCookie}=${cookie}; ${cookieFlags}` });
  }, context);
}

export function operatorLogout(request: Request, context?: HttpContext): Promise<Response> {
  return handle(async (ctx, requestId) => {
    operatorPost(request, ctx.config);
    versioned(await readJson(request), []);
    let cookie: string | undefined;
    try { cookie = sessionFromCookie(request.headers.get("cookie")); }
    catch { /* Clearing an invalid cookie is idempotent logout. */ }
    await logout(ctx.db, cookie, ctx.clock, requestId);
    return empty({ "Set-Cookie": `${sessionCookie}=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
  }, context);
}

export function operatorSession(request: Request, context?: HttpContext): Promise<Response> {
  return handle(async (ctx) => {
    const cookie = sessionFromCookie(request.headers.get("cookie"));
    const result = await sessionStatus(ctx.db, cookie, ctx.clock);
    return json(200, { schema_version: 1, ...result });
  }, context);
}

export function operatorIssueToken(request: Request, context?: HttpContext): Promise<Response> {
  return handle(async (ctx, requestId) => {
    operatorPost(request, ctx.config);
    const body = versioned(await readJson(request), ["request_id", "label", "target_agent_id"]);
    const cookie = sessionFromCookie(request.headers.get("cookie"));
    const result = await issueToken(ctx.db, cookie, issueInput(body), ctx.clock, requestId);
    return json(201, { schema_version: 1, ...result });
  }, context);
}

export function operatorRevokeToken(request: Request, id: string,
  context?: HttpContext): Promise<Response> {
  return handle(async (ctx, requestId) => {
    operatorPost(request, ctx.config);
    versioned(await readJson(request), []);
    const cookie = sessionFromCookie(request.headers.get("cookie"));
    await revokeToken(ctx.db, cookie, id, ctx.clock, requestId);
    return empty();
  }, context);
}

export function agentEnroll(request: Request, context?: HttpContext): Promise<Response> {
  return handle(async (ctx, requestId) => {
    const body = versioned(await readJson(request), ["request_id", "credential", "hostname",
      "os_id", "os_version", "architecture", "agent_version"]);
    const result = await enroll(ctx.db, bearer(request), enrollmentInput(body),
      ctx.config, ctx.clock, requestId);
    const { duplicate, ...wire } = result;
    return json(duplicate ? 200 : 201, { schema_version: 1, ...wire });
  }, context);
}

export function agentHeartbeat(request: Request, context?: HttpContext): Promise<Response> {
  return handle(async (ctx) => {
    const body = versioned(await readJson(request), ["sequence", "sent_at", "agent_version"]);
    const result = await heartbeat(ctx.db, bearer(request), heartbeatInput(body), ctx.clock);
    return json(200, { schema_version: 1, ...result });
  }, context);
}

export function operatorHosts(request: Request, context?: HttpContext): Promise<Response> {
  return handle(async (ctx) => {
    const cookie = sessionFromCookie(request.headers.get("cookie"));
    const options = listOptions(new URL(request.url).search);
    const result = await listHosts(ctx.db, cookie, options, ctx.clock);
    return json(200, { schema_version: 1, ...result });
  }, context);
}

export function operatorHostDetail(request: Request, id: string,
  context?: HttpContext): Promise<Response> {
  return handle(async (ctx) => {
    const cookie = sessionFromCookie(request.headers.get("cookie"));
    if (new URL(request.url).search) fail("invalid_request", 400);
    const result = await detailHost(ctx.db, cookie, id, ctx.clock);
    return json(200, { schema_version: 1, ...result });
  }, context);
}

export function operatorRevokeAgent(request: Request, id: string,
  context?: HttpContext): Promise<Response> {
  return handle(async (ctx, requestId) => {
    operatorPost(request, ctx.config);
    versioned(await readJson(request), []);
    const cookie = sessionFromCookie(request.headers.get("cookie"));
    await revokeAgent(ctx.db, cookie, id, ctx.clock, requestId);
    return empty();
  }, context);
}

export function operatorDiskDefinition(request: Request, context?: HttpContext): Promise<Response> {
  return handle(async (ctx) => {
    if (new URL(request.url).search) fail("invalid_request", 400);
    const result = await readDiskDefinition(ctx.db, sessionFromCookie(request.headers.get("cookie")), ctx.clock);
    return json(200, { schema_version: 1, ...result });
  }, context);
}

export function operatorUpdateDiskDefinition(request: Request, context?: HttpContext): Promise<Response> {
  return handle(async (ctx, requestId) => {
    operatorPost(request, ctx.config);
    const body = versioned(await readJson(request), ["request_id", "expected_revision",
      "warning_percent", "critical_percent", "interval_seconds"]);
    const result = await updateDiskDefinition(ctx.db, sessionFromCookie(request.headers.get("cookie")),
      definitionInput(body), ctx.clock, requestId);
    return json(200, { schema_version: 1, ...result });
  }, context);
}

export function operatorHostDiskPolicy(request: Request, id: string,
  context?: HttpContext): Promise<Response> {
  return handle(async (ctx) => {
    if (new URL(request.url).search) fail("invalid_request", 400);
    const result = await readHostDiskPolicy(ctx.db,
      sessionFromCookie(request.headers.get("cookie")), id, ctx.clock);
    return json(200, { schema_version: 1, ...result });
  }, context);
}

export function operatorSetHostDiskPolicy(request: Request, id: string,
  context?: HttpContext): Promise<Response> {
  return handle(async (ctx, requestId) => {
    operatorPost(request, ctx.config);
    const body: unknown = await readJson(request);
    const mode = body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).mode : undefined;
    const parsed = versioned(body, ["request_id", "expected_policy_version",
      "expected_default_revision", "mode", ...(mode === "override" ?
        ["warning_percent", "critical_percent", "interval_seconds"] : [])]);
    const result = await setHostDiskPolicy(ctx.db,
      sessionFromCookie(request.headers.get("cookie")), id, policyInput(parsed), ctx.clock, requestId);
    return json(200, { schema_version: 1, ...result });
  }, context);
}

export function agentAssignments(request: Request, context?: HttpContext): Promise<Response> {
  return handle(async (ctx) => {
    const body = versioned(await readJson(request),
      ["agent_version", "capabilities", "known_assignment"]);
    const result = await fetchCheckAssignments(ctx.db, bearer(request),
      assignmentInput(body), ctx.clock);
    return json(200, { schema_version: 1, ...result });
  }, context);
}

export function agentDiskRun(request: Request, context?: HttpContext): Promise<Response> {
  return handle(async (ctx) => {
    const body = versioned(await readJson(request, 1024 * 1024), ["run_id", "run_sequence",
      "assignment_id", "started_at", "finished_at", "coverage", "reason",
      "excluded_kernel", "excluded_remote", "dropped_runs", "mounts"]);
    const result = await acceptDiskRun(ctx.db, bearer(request), diskRunInput(body), ctx.clock);
    return json(200, { schema_version: 1, ...result });
  }, context);
}
