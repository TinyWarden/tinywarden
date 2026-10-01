import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { sql } from "kysely";
import { createDb } from "../server/db/client";
import { migrate } from "../server/db/migrate";
import { newCredential } from "../server/validation";
import { initOperator } from "../server/access/operator";
import { sessionCookie } from "../server/access/session";
import type { AppConfig } from "../server/config";
import type { HttpContext } from "../server/http/response";

export type Wire = { [key: string]: unknown; revision: number; assignment_id: string;
  digest: string; not_modified: boolean; changed: boolean; duplicate: boolean;
  policy_version: number; mode: string; warning_percent: number; critical_percent: number;
  interval_seconds: number; current_default_revision: number;
  assignment: { applicability: string; checks: unknown[]; mode: string; definition_revision: number;
    policy_version: number; effective: { warning_percent: number; critical_percent: number;
      interval_seconds: number; stale_after_seconds: number } };
  error: { code: string } };
export async function body(response: Response): Promise<Wire> { return await response.json() as Wire; }

export function makeRequest(origin: string) {
  return (path: string, body?: unknown, credential?: string, cookie?: string): Request =>
    new Request(origin + path, body === undefined
      ? { headers: cookie ? { Cookie: `${sessionCookie}=${cookie}` } : {} }
      : { method: "POST", headers: { "Content-Type": "application/json", Origin: origin,
        "X-TinyWarden-Request": "1", ...(cookie ? { Cookie: `${sessionCookie}=${cookie}` } : {}),
        ...(credential ? { Authorization: `Bearer ${credential}` } : {}) },
        body: JSON.stringify(body) });
}

export async function setupFixture(url: string, config: AppConfig, clock: () => Date) {
  await migrate(url, "tinywarden_test_p1b");
  const db = createDb(url);
  const identity = await sql<{ db: string; role: string; owner: string }>`
    SELECT current_database() AS db, current_user AS role,
      (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) AS owner`.execute(db);
  expect(identity.rows[0]).toEqual({ db: "tinywarden_test_p1b", role: "tinywarden", owner: "tinywarden" });
  const ctx: HttpContext = { db, config, clock };
  let operator = await db.selectFrom("operators").select(["id", "auth_version"])
    .executeTakeFirst();
  if (!operator) {
    await initOperator(db, "synthetic-P2-password-2026", clock);
    operator = await db.selectFrom("operators").select(["id", "auth_version"])
      .executeTakeFirstOrThrow();
  }
  const now = clock();
  const login = newCredential("session");
  await db.insertInto("operator_sessions").values({ id: login.id, operator_id: operator.id,
    secret_digest: login.digest, auth_version: operator.auth_version,
    issued_at: new Date(now.getTime() - 1000), last_seen_at: new Date(now.getTime() - 1000),
    expires_at: new Date(now.getTime() + 3600_000) }).execute();
  const hostId = randomUUID(), agentId = randomUUID();
  const agent = newCredential("agent");
  await db.insertInto("hosts").values({ id: hostId, label: "P2 synthetic host",
    reported_hostname: "p2.example.org", os_id: "debian", os_version: "13",
    architecture: "amd64", enrolled_agent_version: "0.0.1",
    created_at: new Date(now.getTime() - 1000) }).execute();
  await db.insertInto("agents").values({ id: agentId, host_id: hostId,
    current_generation: 1, enrolled_at: new Date(now.getTime() - 1000),
    revoked_at: null, heartbeat_interval_seconds: 60, stale_after_seconds: 180 }).execute();
  await db.insertInto("agent_credentials").values({ id: agent.id, agent_id: agentId,
    generation: 1, secret_digest: agent.digest, created_at: new Date(now.getTime() - 1000),
    revoked_at: null, last_sequence: 0, last_fingerprint: null, accepted_at: null,
    sent_at: null, agent_version: null }).execute();
  return { db, ctx, session: login.value, agentCredential: agent.value, hostId, agentId };
}
