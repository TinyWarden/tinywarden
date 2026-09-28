import { sql, type Kysely, type Transaction } from "kysely";
import type { Database } from "../db/types";
import type { Clock } from "../access/operator";
import { authorize, completeAuthorization } from "../access/session";
import { fail } from "../errors";
import { uuid } from "../validation";

interface Row {
  host_id: string; agent_id: string; label: string; reported_hostname: string;
  os_id: string; os_version: string; architecture: string; enrolled_agent_version: string;
  created_at: Date; revoked_at: Date | null; heartbeat_interval_seconds: number;
  stale_after_seconds: number; accepted_at: Date | null; agent_version: string | null;
}

export interface HostProjection {
  host_id: string; agent_id: string; label: string; reported_hostname: string;
  os_id: string; os_version: string; architecture: string; agent_version: string;
  contact_state: "revoked" | "unknown" | "current" | "stale";
  last_contact_at: string | null; stale_at: string | null;
  heartbeat_interval_seconds: number; stale_after_seconds: number;
  health_state: "unknown"; created_at: string;
}

function project(row: Row, at: Date): HostProjection {
  const contact = row.accepted_at;
  const stale = contact ? new Date(contact.getTime() + row.stale_after_seconds * 1000) : null;
  const state = row.revoked_at ? "revoked" : !contact || at < contact ? "unknown"
    : at < stale! ? "current" : "stale";
  return { host_id: row.host_id, agent_id: row.agent_id, label: row.label,
    reported_hostname: row.reported_hostname, os_id: row.os_id, os_version: row.os_version,
    architecture: row.architecture, agent_version: row.agent_version ?? row.enrolled_agent_version,
    contact_state: state, last_contact_at: contact?.toISOString() ?? null,
    stale_at: stale?.toISOString() ?? null,
    heartbeat_interval_seconds: row.heartbeat_interval_seconds,
    stale_after_seconds: row.stale_after_seconds, health_state: "unknown",
    created_at: row.created_at.toISOString() };
}

function decodeCursor(value: string): { createdAt: Date; id: string } {
  if (value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) fail("invalid_request", 400);
  const bytes = Buffer.from(value, "base64url");
  if (bytes.toString("base64url") !== value) fail("invalid_request", 400);
  let decoded: unknown;
  try { decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail("invalid_request", 400); }
  if (!Array.isArray(decoded) || decoded.length !== 2 || typeof decoded[0] !== "string") {
    fail("invalid_request", 400);
  }
  const id = uuid(decoded[1]);
  const createdAt = new Date(decoded[0]);
  if (Number.isNaN(createdAt.getTime()) || createdAt.getUTCFullYear() < 1 ||
      createdAt.toISOString() !== decoded[0]) {
    fail("invalid_request", 400);
  }
  return { createdAt, id };
}

function encodeCursor(row: Row): string {
  return Buffer.from(JSON.stringify([row.created_at.toISOString(), row.host_id]))
    .toString("base64url");
}

async function rows(trx: Transaction<Database>, condition: ReturnType<typeof sql>,
  limit: number): Promise<Row[]> {
  const result = await sql<Row>`SELECT h.id AS host_id, a.id AS agent_id, h.label,
    h.reported_hostname, h.os_id, h.os_version, h.architecture,
    h.enrolled_agent_version, h.created_at, a.revoked_at,
    a.heartbeat_interval_seconds, a.stale_after_seconds,
    c.accepted_at, c.agent_version
    FROM tinywarden.hosts h
    JOIN tinywarden.agents a ON a.host_id = h.id
    LEFT JOIN tinywarden.agent_credentials c ON c.agent_id = a.id
      AND c.generation = a.current_generation AND c.revoked_at IS NULL
    WHERE ${condition}
    ORDER BY h.created_at DESC, h.id DESC LIMIT ${limit}`.execute(trx);
  return result.rows;
}

export function listOptions(search: string): { limit: number; cursor?: string } {
  const params = new URLSearchParams(search);
  const keys = [...params.keys()];
  if (keys.some((key) => key !== "limit" && key !== "cursor") ||
      keys.length !== new Set(keys).size) fail("invalid_request", 400);
  const rawLimit = params.get("limit");
  if (rawLimit !== null && !/^(?:[1-9]|[1-4][0-9]|50)$/.test(rawLimit)) {
    fail("invalid_request", 400);
  }
  const cursor = params.get("cursor");
  if (cursor !== null) decodeCursor(cursor);
  return { limit: rawLimit === null ? 25 : Number(rawLimit),
    ...(cursor === null ? {} : { cursor }) };
}

export async function listHosts(db: Kysely<Database>, cookie: string,
  options: { limit: number; cursor?: string }, clock: Clock): Promise<{
    as_of: string; hosts: HostProjection[]; next_cursor: string | null }> {
  return db.transaction().execute(async (trx) => {
    const actor = await authorize(trx, cookie, clock);
    const at = await completeAuthorization(trx, actor, actor.at);
    const cursor = options.cursor ? decodeCursor(options.cursor) : null;
    const condition = cursor
      ? sql`(h.created_at,h.id) < (${cursor.createdAt}::timestamptz,${cursor.id}::uuid)`
      : sql`TRUE`;
    const found = await rows(trx, condition, options.limit + 1);
    const page = found.slice(0, options.limit);
    return { as_of: at.toISOString(), hosts: page.map((row) => project(row, at)),
      next_cursor: found.length > options.limit && page.length > 0
        ? encodeCursor(page[page.length - 1]!) : null };
  });
}

export async function detailHost(db: Kysely<Database>, cookie: string,
  id: string, clock: Clock): Promise<{ as_of: string; host: HostProjection }> {
  uuid(id);
  return db.transaction().execute(async (trx) => {
    const actor = await authorize(trx, cookie, clock);
    const at = await completeAuthorization(trx, actor, actor.at);
    const found = await rows(trx, sql`h.id = ${id}::uuid`, 1);
    if (!found[0]) fail("not_found", 404);
    return { as_of: at.toISOString(), host: project(found[0], at) };
  });
}
