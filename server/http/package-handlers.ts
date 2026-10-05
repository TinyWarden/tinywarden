import { sessionFromCookie } from "../access/session";
import { fail } from "../errors";
import { versioned } from "../validation";
import { handle, json, operatorPost, readJson, bearer, type HttpContext } from "./response";
import { readPackageSkills, setPackageEnabled } from "../skills/catalog/package-controls";
import { fetchPackageAssignments } from "../skills/assignments/packages";
import { packageRunInput } from "../skills/results/package-input";
import { acceptPackageRun } from "../skills/results/package-runs";
import { updatePackageDefaults } from "../skills/settings/package-defaults";
import { readPackagePolicy, setPackagePolicy } from "../skills/settings/package-policies";
import { readPackageResults } from "../skills/results/package-projection";
import { uploadSkill } from "../skills/catalog/package-upload";
import { downloadSkill } from "../skills/assignments/package-download";
import { selectPackageVersion, readPackageVersions } from "../skills/catalog/package-version";

const noQuery = (r: Request) => { if (new URL(r.url).search) fail("invalid_request", 400); };
export function operatorPackageUpload(r: Request, context?: HttpContext) {
  return handle(async (ctx) => {
    operatorPost(r, ctx.config); noQuery(r);
    return json(200, { schema_version: 1, result: await uploadSkill(ctx.db, sessionFromCookie(r.headers.get("cookie")), r, ctx.clock) });
  }, context);
}
export function agentPackageDownload(r: Request, id: string, context?: HttpContext) {
  return handle(async (ctx) => {
    noQuery(r);
    if (r.headers.has("cookie") || r.headers.has("origin")) fail("invalid_request", 400);
    return downloadSkill(ctx.db, bearer(r), id, ctx.clock);
  }, context);
}
export function operatorPackageVersion(r: Request, id: string, context?: HttpContext) {
  return handle(async (ctx) => {
    operatorPost(r, ctx.config); noQuery(r);
    const b = versioned(await readJson(r, 128 * 1024, true), ["request_id", "content_sha256", "expected_enablement_version", "grants"]);
    if (typeof b.request_id !== "string" || typeof b.content_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(b.content_sha256) || !Array.isArray(b.grants)) fail("invalid_request", 400);
    return json(200, { schema_version: 1, result: await selectPackageVersion(ctx.db, sessionFromCookie(r.headers.get("cookie")), id,
      { request_id: b.request_id, content_sha256: b.content_sha256, expected_enablement_version: counter(b.expected_enablement_version), grants: b.grants as Record<string, unknown>[] }, ctx.clock) });
  }, context);
}
export function operatorPackageVersions(r: Request, id: string, context?: HttpContext) {
  return handle(async (ctx) => {
    const query=new URL(r.url).searchParams;
    if([...query.keys()].some((k)=>k!=="content_sha256")||query.getAll("content_sha256").length>1)fail("invalid_request",400);
    return boundedJson({schema_version:1,...await readPackageVersions(ctx.db,sessionFromCookie(r.headers.get("cookie")),id,ctx.clock,query.get("content_sha256")??undefined)});
  },context);
}
function counter(value: unknown): string {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,15})$/.test(value) || !Number.isSafeInteger(Number(value))) fail("invalid_request", 400);
  return value;
}
function boundedJson(body: unknown) {
  if (Buffer.byteLength(JSON.stringify(body)) > 1024 * 1024) fail("temporarily_unavailable", 503);
  return json(200, body);
}
export function agentPackageAssignments(r: Request, context?: HttpContext) {
  return handle(async (ctx) => {
    noQuery(r);
    const body = versioned(await readJson(r, 4096, true), ["runtime_ready"]);
    if (typeof body.runtime_ready !== "boolean") fail("invalid_request", 400);
    return boundedJson({ schema_version: 1, ...await fetchPackageAssignments(ctx.db, bearer(r), body.runtime_ready, ctx.clock) });
  }, context);
}
export function agentPackageRun(r: Request, context?: HttpContext) {
  return handle(async (ctx) => {
    noQuery(r);
    const body = versioned(await readJson(r, 1024 * 1024, true), ["run_id", "run_sequence", "assignment_id", "started_at", "finished_at", "outcome", "observation"]);
    return json(200, { schema_version: 1, ...await acceptPackageRun(ctx.db, bearer(r), packageRunInput(body), ctx.clock) });
  }, context);
}
export function operatorPackageSkills(r: Request, context?: HttpContext) {
  return handle(async (ctx) => {
    noQuery(r);
    return boundedJson({ schema_version: 1, as_of: ctx.clock().toISOString(), skills: await readPackageSkills(ctx.db, sessionFromCookie(r.headers.get("cookie")), ctx.clock) });
  }, context);
}
export function operatorPackageEnabled(r: Request, id: string, context?: HttpContext) {
  return handle(async (ctx) => {
    operatorPost(r, ctx.config); noQuery(r);
    const body = versioned(await readJson(r, 128 * 1024, true), ["request_id", "expected_enablement_version", "content_sha256", "enabled", "grants"]);
    if (typeof body.request_id !== "string" || typeof body.content_sha256 !== "string" || typeof body.enabled !== "boolean" || !Array.isArray(body.grants)) fail("invalid_request", 400);
    const result = await setPackageEnabled(ctx.db, sessionFromCookie(r.headers.get("cookie")), id,
      { request_id: body.request_id, expected_enablement_version: counter(body.expected_enablement_version),
        content_sha256: body.content_sha256, enabled: body.enabled, grants: body.grants as Record<string, unknown>[] }, ctx.clock);
    return json(200, { schema_version: 1, result });
  }, context);
}
export function operatorPackageDefaults(r: Request, id: string, context?: HttpContext) {
  return handle(async (ctx) => {
    operatorPost(r, ctx.config); noQuery(r);
    const body = versioned(await readJson(r, 128 * 1024, true), ["request_id", "expected_revision", "settings"]);
    if (typeof body.request_id !== "string") fail("invalid_request", 400);
    const result = await updatePackageDefaults(ctx.db, sessionFromCookie(r.headers.get("cookie")), id,
      { request_id: body.request_id, expected_revision: counter(body.expected_revision), settings: body.settings }, ctx.clock);
    return json(200, { schema_version: 1, result });
  }, context);
}
export function operatorPackagePolicy(r: Request, host: string, id: string, context?: HttpContext) {
  return handle(async (ctx) => {
    noQuery(r);
    return json(200, { schema_version: 1, ...await readPackagePolicy(ctx.db, sessionFromCookie(r.headers.get("cookie")), host, id, ctx.clock) });
  }, context);
}
export function operatorPackageResults(r: Request, host: string, context?: HttpContext) {
  return handle(async (ctx) => {
    noQuery(r);
    return boundedJson({ schema_version: 1, ...await readPackageResults(ctx.db, sessionFromCookie(r.headers.get("cookie")), host, ctx.clock) });
  }, context);
}
export function operatorSetPackagePolicy(r: Request, host: string, id: string, context?: HttpContext) {
  return handle(async (ctx) => {
    operatorPost(r, ctx.config); noQuery(r);
    const body = versioned(await readJson(r, 128 * 1024, true), ["request_id", "expected_default_revision", "expected_policy_version", "overrides"]);
    if (typeof body.request_id !== "string") fail("invalid_request", 400);
    const result = await setPackagePolicy(ctx.db, sessionFromCookie(r.headers.get("cookie")), host, id,
      { request_id: body.request_id, expected_default_revision: counter(body.expected_default_revision),
        expected_policy_version: counter(body.expected_policy_version), overrides: body.overrides }, ctx.clock);
    return json(200, { schema_version: 1, result });
  }, context);
}
