import { randomUUID } from "node:crypto";
import { loadConfig, type AppConfig } from "../config";
import { runtimeDb } from "../db/client";
import type { Kysely } from "kysely";
import type { Database } from "../db/types";
import { AppError, fail } from "../errors";

export interface HttpContext { db: Kysely<Database>; config: AppConfig; clock: () => Date }
export function runtimeContext(): HttpContext {
  const config = loadConfig();
  return { db: runtimeDb(config.databaseUrl), config, clock: () => new Date() };
}

export function json(status: number, body: unknown, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", ...headers,
  } });
}

export function empty(headers?: HeadersInit): Response {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer", ...headers } });
}

let active = 0;
export async function handle(action: (context: HttpContext, requestId: string) => Promise<Response>,
  context?: HttpContext): Promise<Response> {
  const requestId = randomUUID();
  if (active >= 64) return errorResponse(new AppError("temporarily_unavailable", 503, 1), requestId);
  active++;
  try { return await action(context ?? runtimeContext(), requestId); }
  catch (error) { return errorResponse(error, requestId); }
  finally { active--; }
}

function errorResponse(error: unknown, requestId: string): Response {
  const safe = error instanceof AppError ? error : new AppError("temporarily_unavailable", 503);
  if (!(error instanceof AppError)) {
    console.error(JSON.stringify({ event: "request_failed", request_id: requestId,
      code: "internal_failure" }));
  }
  const detail: { code: string; token_id?: string } = { code: safe.code };
  if (safe.code === "token_already_issued" && safe.tokenId) detail.token_id = safe.tokenId;
  return json(safe.status, { schema_version: 1, error: detail, request_id: requestId },
    safe.retryAfter === undefined ? undefined : { "Retry-After": String(safe.retryAfter) });
}

export async function readJson(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type")?.toLowerCase().replace(/\s+/g, "");
  if (type !== "application/json" && type !== "application/json;charset=utf-8") {
    fail("unsupported_media", 415);
  }
  if (request.headers.has("content-encoding")) fail("unsupported_media", 415);
  const length = request.headers.get("content-length");
  if (length !== null && (!/^(0|[1-9][0-9]*)$/.test(length) || Number(length) > 16 * 1024)) {
    fail("request_too_large", 413);
  }
  if (!request.body) fail("invalid_request", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.length;
      if (size > 16 * 1024) fail("request_too_large", 413);
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { fail("invalid_request", 400); }
}

export function operatorPost(request: Request, config: AppConfig): void {
  if (request.headers.get("origin") !== config.origin ||
      request.headers.get("x-tinywarden-request") !== "1" ||
      request.headers.get("sec-fetch-site") === "cross-site") fail("origin_rejected", 403);
}

export function bearer(request: Request): string {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ") || header.length > 200 || header.includes(",")) {
    fail("unauthorized", 401);
  }
  return header.slice(7);
}
