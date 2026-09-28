import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, type Kysely } from "kysely";
import { createDb } from "../server/db/client";
import { parseDatabaseUrl } from "../server/config";
import type { Database } from "../server/db/types";
import { initOperator, login, resetPassword } from "../server/access/operator";
import { hashPassword } from "../server/access/password";
import { logout, sessionStatus, sessionFromCookie, sessionCookie } from "../server/access/session";
import { agentEnroll, operatorIssueToken, operatorLogin, operatorRevokeToken } from "../server/http/handlers";
import type { HttpContext } from "../server/http/response";
import { newCredential, password } from "../server/validation";

const url = process.env.TW_TEST_DATABASE_URL;
if (url && new URL(parseDatabaseUrl(url, "tinywarden")).pathname !== "/tinywarden_test_p1b") {
  throw new Error("P1.B tests require the owned test database");
}
const origin = "https://warden.example.org";
const secret = "synthetic-access-secret-α";
let db: Kysely<Database>;
let ctx: HttpContext;
let now = new Date("2026-09-28T14:00:00.000Z");
let latestSession: string;

function request(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${origin}${path}`, { method: "POST", body: JSON.stringify(body), headers: {
    Origin: origin, "Content-Type": "application/json", "X-TinyWarden-Request": "1", ...headers,
  } });
}
function auth(): Record<string, string> { return { Cookie: `${sessionCookie}=${latestSession}` }; }
async function code(response: Response): Promise<string> { return (await response.json()).error.code; }
async function issue(label = "fixture-host"):
Promise<{ token: string; token_id: string; expires_at: string }> {
  const response = await operatorIssueToken(request("/api/v1/operator/enrollment-tokens",
    { schema_version: 1, request_id: randomUUID(), label, target_agent_id: null }, auth()), ctx);
  expect(response.status).toBe(201);
  return response.json();
}
function enrollmentBody(credential = newCredential("agent").value, requestId = randomUUID()) {
  return { schema_version: 1, request_id: requestId, credential,
    hostname: "fixture.example.org", os_id: "debian", os_version: "13",
    architecture: "amd64", agent_version: "0.0.1" };
}
function enroll(token: string, body: unknown): Promise<Response> {
  return agentEnroll(request("/api/v1/agent/enroll", body, { Authorization: `Bearer ${token}` }), ctx);
}

describe.skipIf(!url)("P1.B boundary and expiry behavior", () => {
  beforeAll(async () => {
    db = createDb(url!);
    const { rows } = await sql<{ database_name: string; session_role: string;
      current_role: string; database_owner: string; schema_owner: string }>`
      SELECT current_database() AS database_name, session_user AS session_role,
        current_user AS current_role,
        (SELECT pg_get_userbyid(datdba) FROM pg_database
          WHERE datname = current_database()) AS database_owner,
        (SELECT pg_get_userbyid(nspowner) FROM pg_namespace
          WHERE nspname = 'tinywarden') AS schema_owner`.execute(db);
    const target = rows[0];
    if (!target || target.database_name !== "tinywarden_test_p1b" ||
        target.session_role !== "tinywarden" || target.current_role !== "tinywarden" ||
        target.database_owner !== "tinywarden" || target.schema_owner !== "tinywarden") {
      throw new Error("P1.B fixture target or owner mismatch");
    }
    await sql`CREATE TABLE IF NOT EXISTS tinywarden.test_audit_fail (action text PRIMARY KEY)`.execute(db);
    await sql`CREATE OR REPLACE FUNCTION tinywarden.reject_test_audit() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        IF EXISTS (SELECT 1 FROM tinywarden.test_audit_fail WHERE action = NEW.action) THEN
          RAISE EXCEPTION 'injected audit failure';
        END IF;
        RETURN NEW;
      END $$`.execute(db);
    await sql`DROP TRIGGER IF EXISTS reject_test_audit ON tinywarden.audit_events`.execute(db);
    await sql`CREATE TRIGGER reject_test_audit BEFORE INSERT ON tinywarden.audit_events
      FOR EACH ROW EXECUTE FUNCTION tinywarden.reject_test_audit()`.execute(db);
    await sql`DELETE FROM tinywarden.test_audit_fail`.execute(db);
    await sql`TRUNCATE tinywarden.audit_events, tinywarden.enrollment_tokens,
      tinywarden.agent_credentials, tinywarden.agents, tinywarden.hosts,
      tinywarden.operator_sessions, tinywarden.login_throttle, tinywarden.operators`.execute(db);
    ctx = { db, clock: () => now, config: { origin, databaseUrl: url!, heartbeatIntervalSeconds: 60,
      staleAfterSeconds: 180 } };
    await initOperator(db, secret, () => now);
  });
  afterAll(async () => { if (db) await db.destroy(); });

  it("bounds password input and rejects parallel password hashing", async () => {
    expect(password("a".repeat(15))).toBe("a".repeat(15));
    expect(password("🙂".repeat(15))).toBe("🙂".repeat(15));
    expect(() => password("a".repeat(14))).toThrow();
    expect(() => password("a".repeat(129))).toThrow();
    expect(() => password("\ud800".repeat(15))).toThrow();
    expect(() => password("🧪".repeat(129))).toThrow();
    const [first, second] = await Promise.allSettled([
      hashPassword("parallel-passphrase-one"), hashPassword("parallel-passphrase-two"),
    ]);
    expect([first.status, second.status].sort()).toEqual(["fulfilled", "rejected"]);
  });

  it("rejects malformed and cross-origin browser writes before allocating a session", async () => {
    const body = { schema_version: 1, login: "admin", password: secret };
    for (const headers of [
      { Origin: "null" }, { Origin: "https://sibling.example.org" },
      { Origin: "" }, { "X-TinyWarden-Request": "" },
      { "Sec-Fetch-Site": "cross-site" },
      { Origin: "https://evil.example.org", Host: "warden.example.org" },
      { Origin: "https://evil.example.org", "X-Forwarded-Host": "warden.example.org" },
    ]) {
      const response = await operatorLogin(request("/api/v1/operator/login", body, headers), ctx);
      expect(response.status).toBe(403);
    }
    const noOrigin = await operatorLogin(new Request(`${origin}/api/v1/operator/login`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-TinyWarden-Request": "1" },
      body: JSON.stringify(body),
    }), ctx);
    expect(noOrigin.status).toBe(403);
    const form = await operatorLogin(request("/api/v1/operator/login", body,
      { "Content-Type": "application/x-www-form-urlencoded" }), ctx);
    expect(form.status).toBe(415);
    const encoded = await operatorLogin(request("/api/v1/operator/login", body,
      { "Content-Encoding": "gzip" }), ctx);
    expect(encoded.status).toBe(415);
    const oversized = await operatorLogin(request("/api/v1/operator/login",
      { ...body, extra: "x".repeat(17 * 1024) }), ctx);
    expect(oversized.status).toBe(413);
    const wrongVersion = await operatorLogin(request("/api/v1/operator/login",
      { ...body, schema_version: 2 }), ctx);
    expect(wrongVersion.status).toBe(400);
    const rows = await db.selectFrom("operator_sessions").select("id").execute();
    expect(rows).toHaveLength(0);
  });

  it("persists throttle across a new pool and enforces idle, absolute and clock edges", async () => {
    const issued: string[] = [];
    const firstIssuedAt = now;
    for (let i = 0; i < 5; i++) {
      issued.push(await login(db, "admin", secret, () => now));
      now = new Date(now.getTime() + 1);
    }
    const oldest = issued[0]!;
    expect(new Set(issued).size).toBe(5);
    await db.destroy();
    db = createDb(url!);
    ctx.db = db;
    const limited = await operatorLogin(request("/api/v1/operator/login",
      { schema_version: 1, login: "admin", password: secret }), ctx);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(sessionFromCookie(`${sessionCookie}=${oldest}`)).toBe(oldest);
    expect(() => sessionFromCookie(`${sessionCookie}=${oldest}; ${sessionCookie}=${oldest}`)).toThrow();
    await expect(sessionStatus(db, oldest, () =>
      new Date(firstIssuedAt.getTime() - 1))).rejects.toThrow();
    await expect(sessionStatus(db, oldest, () =>
      new Date(firstIssuedAt.getTime() + 30 * 60_000))).rejects.toThrow();
    await expect(sessionStatus(db, oldest, () =>
      new Date(firstIssuedAt.getTime() + 8 * 60 * 60_000))).rejects.toThrow();
    now = new Date(now.getTime() + 61_000);
    latestSession = await login(db, "admin", secret, () => now);
    const rows = await db.selectFrom("operator_sessions").select("id").execute();
    expect(rows).toHaveLength(5);
    await expect(sessionStatus(db, oldest, () => now)).rejects.toThrow();
    expect((await sessionStatus(db, latestSession, () => now)).login).toBe("admin");
  }, 30000);

  it("limits active tokens, revokes once, and denies unknown or expired enrollment", async () => {
    const issued: { token: string; token_id: string }[] = [];
    for (let i = 0; i < 20; i++) issued.push(await issue(`fixture-${i}`));
    const denied = await operatorIssueToken(request("/api/v1/operator/enrollment-tokens",
      { schema_version: 1, request_id: randomUUID(), label: "overflow", target_agent_id: null },
      auth()), ctx);
    expect([denied.status, await code(denied)]).toEqual([409, "token_limit"]);
    const unknown = await enroll(newCredential("enrollment").value, enrollmentBody());
    expect(unknown.status).toBe(401);
    await sql`INSERT INTO tinywarden.test_audit_fail(action)
      VALUES ('enrollment.revoked')`.execute(db);
    const failedRevoke = await operatorRevokeToken(request(
      `/api/v1/operator/enrollment-tokens/${issued[0]!.token_id}/revoke`,
      { schema_version: 1 }, auth()), issued[0]!.token_id, ctx);
    expect(failedRevoke.status).toBe(503);
    const stillUsable = await db.selectFrom("enrollment_tokens").select("revoked_at")
      .where("id", "=", issued[0]!.token_id).executeTakeFirstOrThrow();
    expect(stillUsable.revoked_at).toBeNull();
    await sql`DELETE FROM tinywarden.test_audit_fail`.execute(db);
    const revoked = await operatorRevokeToken(request(
      `/api/v1/operator/enrollment-tokens/${issued[0]!.token_id}/revoke`,
      { schema_version: 1 }, auth()), issued[0]!.token_id, ctx);
    expect(revoked.status).toBe(204);
    const repeat = await operatorRevokeToken(request(
      `/api/v1/operator/enrollment-tokens/${issued[0]!.token_id}/revoke`,
      { schema_version: 1 }, auth()), issued[0]!.token_id, ctx);
    expect(repeat.status).toBe(204);
    expect((await issue()).token).toMatch(/^tw_e_/);
    now = new Date(now.getTime() + 15 * 60_000);
    const expired = await enroll(issued[1]!.token, enrollmentBody());
    expect([expired.status, await code(expired)]).toEqual([401, "unauthorized"]);
  });

  it("checks token expiry after waiting on its row lock", async () => {
    const token = await issue();
    let unlock!: () => void;
    let locked!: () => void;
    const release = new Promise<void>((resolve) => { unlock = resolve; });
    const acquired = new Promise<void>((resolve) => { locked = resolve; });
    const holder = db.transaction().execute(async (trx) => {
      await trx.selectFrom("enrollment_tokens").select("id")
        .where("id", "=", token.token_id).forUpdate().executeTakeFirstOrThrow();
      locked();
      await release;
    });
    await acquired;
    let effective = new Date(Date.parse(token.expires_at) - 1);
    const clocked = { ...ctx, clock: () => effective };
    const body = enrollmentBody();
    const pending = agentEnroll(request("/api/v1/agent/enroll", body,
      { Authorization: `Bearer ${token.token}` }), clocked);
    try {
      let waiting = false;
      for (let i = 0; i < 40; i++) {
        const state = await sql<{ n: string }>`SELECT count(*)::text AS n FROM pg_stat_activity
          WHERE datname = current_database() AND usename = current_user
            AND wait_event_type = 'Lock' AND query LIKE '%enrollment_tokens%'`.execute(db);
        if (Number(state.rows[0]?.n) > 0) { waiting = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(waiting).toBe(true);
      effective = new Date(token.expires_at);
    } finally {
      unlock();
      await holder;
    }
    const result = await pending;
    expect([result.status, await code(result)]).toEqual([401, "unauthorized"]);
  }, 10000);

  it("rejects cross-token identities and applies the 24-hour replay boundary", async () => {
    const first = await issue();
    const body = enrollmentBody();
    const accepted = await enroll(first.token, body);
    expect(accepted.status).toBe(201);
    const second = await issue();
    const credentialCollision = await enroll(second.token, { ...body, request_id: randomUUID() });
    expect([credentialCollision.status, await code(credentialCollision)])
      .toEqual([409, "credential_conflict"]);
    const requestCollision = await enroll(second.token, enrollmentBody(undefined, body.request_id));
    expect([requestCollision.status, await code(requestCollision)])
      .toEqual([409, "enrollment_conflict"]);
    const before = await db.selectFrom("hosts").select("id").execute();
    expect(before).toHaveLength(1);
    now = new Date(now.getTime() + 24 * 60 * 60_000 - 1);
    expect((await enroll(first.token, body)).status).toBe(200);
    now = new Date(now.getTime() + 1);
    expect((await enroll(first.token, body)).status).toBe(401);
    expect(await db.selectFrom("hosts").select("id").execute()).toHaveLength(1);
  });

  it("does not mint an old-authority session when reset races login", async () => {
    now = new Date(now.getTime() + 61_000);
    const result = await Promise.allSettled([
      login(db, "admin", secret, () => now),
      resetPassword(db, "synthetic-new-secret-β", () => now),
    ]);
    expect(result[1]!.status).toBe("fulfilled");
    expect(await db.selectFrom("operator_sessions").select("id").execute()).toHaveLength(0);
    const old = await operatorLogin(request("/api/v1/operator/login",
      { schema_version: 1, login: "admin", password: secret }), ctx);
    expect(old.status).toBe(401);
    const fresh = await login(db, "admin", "synthetic-new-secret-β", () => now);
    await logout(db, fresh, () => now, randomUUID());
    await expect(sessionStatus(db, fresh, () => now)).rejects.toThrow();
  }, 30000);
});
