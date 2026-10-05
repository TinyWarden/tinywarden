import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql, type Kysely } from "kysely";
import { createDb } from "../server/db/client";
import { parseDatabaseUrl } from "../server/config";
import type { Database } from "../server/db/types";
import { initOperator, resetPassword } from "../server/access/operator";
import { sessionCookie } from "../server/access/session";
import { newCredential } from "../server/validation";
import { operatorLogin, operatorSession, operatorLogout, operatorIssueToken,
  operatorRevokeToken, agentEnroll } from "../server/http/handlers";
import type { HttpContext } from "../server/http/response";

const url = process.env.TW_TEST_DATABASE_URL;
if (url && new URL(parseDatabaseUrl(url, "tinywarden")).pathname !== "/tinywarden_test_p1b") {
  throw new Error("P1.B tests require the dedicated tinywarden_test_p1b database");
}

const firstPassword = "synthetic-password-α-42";
const nextPassword = "synthetic-password-β-43";
let db: Kysely<Database>;
let context: HttpContext;
let now = new Date("2026-09-28T12:00:00.000Z");
const origin = "https://warden.example.org";

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${origin}${path}`, { method: "POST", headers: {
    Origin: origin, "X-TinyWarden-Request": "1", "Content-Type": "application/json", ...headers,
  }, body: JSON.stringify(body) });
}

function cookie(value: string): string { return `${sessionCookie}=${value}`; }
function parseCookie(response: Response): string {
  const value = response.headers.get("set-cookie")?.match(/__Host-tinywarden_session=([^;]+)/)?.[1];
  if (!value) throw new Error("No session cookie");
  return value;
}

async function count(table: keyof Database): Promise<number> {
  const row = await db.selectFrom(table).select(({ fn }) => fn.count<string>("id").as("n"))
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

async function failAudit(action: string | null): Promise<void> {
  await sql`DELETE FROM tinywarden.test_audit_fail`.execute(db);
  if (action) await sql`INSERT INTO tinywarden.test_audit_fail(action) VALUES (${action})`.execute(db);
}

describe.skipIf(!url)("P1.B access and enrollment on the existing test database", () => {
  beforeAll(async () => {
    db = createDb(url!);
    const identity = await sql<{ database_name: string; session_role: string;
      current_role: string; database_owner: string; schema_owner: string }>`
      SELECT current_database() AS database_name, session_user AS session_role,
        current_user AS current_role,
        (SELECT pg_get_userbyid(datdba) FROM pg_database
          WHERE datname = current_database()) AS database_owner,
        (SELECT pg_get_userbyid(nspowner) FROM pg_namespace
          WHERE nspname = 'tinywarden') AS schema_owner`.execute(db);
    const target = identity.rows[0];
    if (!target || target.database_name !== "tinywarden_test_p1b" ||
        target.session_role !== "tinywarden" || target.current_role !== "tinywarden" ||
        target.database_owner !== "tinywarden" || target.schema_owner !== "tinywarden") {
      throw new Error("P1.B fixture target or owner mismatch");
    }
    context = { db, config: { origin, databaseUrl: url!, heartbeatIntervalSeconds: 60,
      staleAfterSeconds: 180 }, clock: () => now };
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
    await sql`TRUNCATE tinywarden.skill_runtime_hosts, tinywarden.skill_packages, tinywarden.skill_installations, tinywarden.skill_settings_revisions, tinywarden.host_skill_policies, tinywarden.host_skill_policy_revisions, tinywarden.skill_assignments, tinywarden.skill_observations, tinywarden.skill_states, tinywarden.skill_package_receipts, tinywarden.skill_package_mutations,
      tinywarden.skill_enablement_receipts, tinywarden.history_events, tinywarden.history_subjects, tinywarden.history_control,
      tinywarden.notification_outbox, tinywarden.notification_cursors,
      tinywarden.notification_routes, tinywarden.disk_run_receipts, tinywarden.baseline_run_receipts,
      tinywarden.baseline_runs, tinywarden.baseline_recovery_latches,
      tinywarden.baseline_receipts, tinywarden.baseline_snapshots,
      tinywarden.baseline_policy_revisions, tinywarden.baseline_policies,
      tinywarden.disk_run_mounts, tinywarden.disk_runs,
      tinywarden.disk_recovery_latches,
      tinywarden.check_mutation_receipts,
      tinywarden.check_assignment_snapshots, tinywarden.host_check_policy_revisions,
      tinywarden.host_check_policies, tinywarden.audit_events, tinywarden.enrollment_tokens,
      tinywarden.agent_credentials, tinywarden.agents, tinywarden.hosts,
      tinywarden.operator_sessions, tinywarden.login_throttle, tinywarden.operators`.execute(db);
    await failAudit(null);
  });
  afterAll(async () => { if (db) await db.destroy(); });

  it("rolls back failed init and creates one account under concurrent init", async () => {
    await failAudit("operator.initialized");
    await expect(initOperator(db, firstPassword, () => now)).rejects.toThrow();
    expect(await count("operators")).toBe(0);
    await failAudit(null);
    const attempts = await Promise.allSettled([
      initOperator(db, firstPassword, () => now), initOperator(db, firstPassword, () => now),
    ]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await count("operators")).toBe(1);
    const account = await db.selectFrom("operators").selectAll().executeTakeFirstOrThrow();
    expect(account.password_algorithm).toBe("scrypt-v1");
    expect([account.password_n, account.password_r, account.password_p]).toEqual([131072, 8, 1]);
    expect(account.password_salt).toHaveLength(16);
    expect(account.password_hash).toHaveLength(64);
  }, 30000);

  it("rejects cross-origin login and rolls back a login when audit fails", async () => {
    const badOrigin = await operatorLogin(post("/api/v1/operator/login",
      { schema_version: 1, login: "admin", password: firstPassword },
      { Origin: "https://other.example.org" }), context);
    expect(badOrigin.status).toBe(403);
    expect(await count("operator_sessions")).toBe(0);
    await failAudit("operator.login");
    const diagnostics = vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = await operatorLogin(post("/api/v1/operator/login",
      { schema_version: 1, login: "admin", password: firstPassword }), context);
    const events = diagnostics.mock.calls.map(([value]) => JSON.parse(String(value)));
    diagnostics.mockRestore();
    expect(failed.status).toBe(503);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ event: "request_failed", request_id: expect.any(String),
      code: "internal_failure" });
    expect(JSON.stringify(events)).not.toContain(firstPassword);
    expect(await count("operator_sessions")).toBe(0);
    await failAudit(null);
  }, 30000);

  let session: string;
  it("issues a guarded session and enforces the persistent login limiter", async () => {
    const wrong = await operatorLogin(post("/api/v1/operator/login",
      { schema_version: 1, login: "unknown", password: firstPassword }), context);
    expect(wrong.status).toBe(401);
    const good = await operatorLogin(post("/api/v1/operator/login",
      { schema_version: 1, login: "admin", password: firstPassword }), context);
    expect(good.status).toBe(200);
    session = parseCookie(good);
    expect(good.headers.get("set-cookie")).toContain("Secure; HttpOnly; SameSite=Strict; Path=/");
    expect(good.headers.get("cache-control")).toBe("no-store");
    const sessionResponse = await operatorSession(new Request(`${origin}/api/v1/operator/session`,
      { headers: { Cookie: cookie(session) } }), context);
    expect(sessionResponse.status).toBe(200);
    for (let i = 0; i < 2; i++) {
      const result = await operatorLogin(post("/api/v1/operator/login",
        { schema_version: 1, login: "admin", password: "incorrect-password-123" }), context);
      expect(result.status).toBe(401);
    }
    const limited = await operatorLogin(post("/api/v1/operator/login",
      { schema_version: 1, login: "admin", password: firstPassword }), context);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    now = new Date(now.getTime() + 61_000);
  }, 30000);

  let token: string;
  let tokenId: string;
  it("issues once, hides a lost secret, and rolls back token audit failure", async () => {
    const failedId = randomUUID();
    await failAudit("enrollment.issued");
    const failed = await operatorIssueToken(post("/api/v1/operator/enrollment-tokens",
      { schema_version: 1, request_id: failedId, label: "host-one", target_agent_id: null },
      { Cookie: cookie(session) }), context);
    expect(failed.status).toBe(503);
    expect(await count("enrollment_tokens")).toBe(0);
    await failAudit(null);
    const issueId = randomUUID();
    const body = { schema_version: 1, request_id: issueId, label: "host-one", target_agent_id: null };
    const issued = await operatorIssueToken(post("/api/v1/operator/enrollment-tokens", body,
      { Cookie: cookie(session) }), context);
    expect(issued.status).toBe(201);
    const payload = await issued.json();
    token = payload.token;
    tokenId = payload.token_id;
    const retry = await operatorIssueToken(post("/api/v1/operator/enrollment-tokens", body,
      { Cookie: cookie(session) }), context);
    expect(retry.status).toBe(409);
    const retryBody = await retry.json();
    expect(retryBody.error).toEqual({ code: "token_already_issued", token_id: tokenId });
    expect(JSON.stringify(retryBody)).not.toContain(token);
    const changed = await operatorIssueToken(post("/api/v1/operator/enrollment-tokens",
      { ...body, label: "changed" }, { Cookie: cookie(session) }), context);
    expect(changed.status).toBe(409);
    expect(await count("enrollment_tokens")).toBe(1);
    const stored = await db.selectFrom("enrollment_tokens").selectAll().executeTakeFirstOrThrow();
    expect(stored.secret_digest).toHaveLength(32);
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  const agentCredential = newCredential("agent");
  const enrollmentBody = { schema_version: 1, request_id: randomUUID(),
    credential: agentCredential.value, hostname: "host-one.example.org", os_id: "debian",
    os_version: "13", architecture: "amd64", agent_version: "0.0.1" };
  function enrollRequest(body: unknown = enrollmentBody, bearer = token): Request {
    return post("/api/v1/agent/enroll", body, { Authorization: `Bearer ${bearer}` });
  }

  it("rolls back enrollment audit failure, then serializes identical redemptions", async () => {
    await failAudit("agent.enrolled");
    const failed = await agentEnroll(enrollRequest(), context);
    expect(failed.status).toBe(503);
    expect(await count("hosts")).toBe(0);
    const available = await db.selectFrom("enrollment_tokens").select("consumed_at")
      .where("id", "=", tokenId).executeTakeFirstOrThrow();
    expect(available.consumed_at).toBeNull();
    await failAudit(null);
    const [first, second] = await Promise.all([
      agentEnroll(enrollRequest(), context), agentEnroll(enrollRequest(), context),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 201]);
    const a = await first.json();
    const b = await second.json();
    expect(a.host_id).toBe(b.host_id);
    expect(a.agent_id).toBe(b.agent_id);
    expect(a.credential_id).toBe(agentCredential.id);
    expect(await count("hosts")).toBe(1);
    expect(await count("agents")).toBe(1);
    expect(await count("agent_credentials")).toBe(1);
    const audits = await db.selectFrom("audit_events").select(({ fn }) => fn.count<string>("id").as("n"))
      .where("action", "=", "agent.enrolled").executeTakeFirstOrThrow();
    expect(Number(audits.n)).toBe(1);
    const changed = await agentEnroll(enrollRequest({ ...enrollmentBody, hostname: "other.example.org" }), context);
    expect(changed.status).toBe(409);
  });

  it("replays after expiry, then blocks replay after revocation", async () => {
    await db.destroy();
    db = createDb(url!);
    context.db = db;
    now = new Date(now.getTime() + 16 * 60_000);
    const replay = await agentEnroll(enrollRequest(), context);
    expect(replay.status).toBe(200);
    const revoke = await operatorRevokeToken(post(`/api/v1/operator/enrollment-tokens/${tokenId}/revoke`,
      { schema_version: 1 }, { Cookie: cookie(session) }), tokenId, context);
    expect(revoke.status).toBe(204);
    const denied = await agentEnroll(enrollRequest(), context);
    expect(denied.status).toBe(401);
    expect(await count("agent_credentials")).toBe(1);
  });

  it("rolls back password reset audit failure and invalidates sessions on success", async () => {
    await failAudit("operator.password_reset");
    await expect(resetPassword(db, nextPassword, () => now)).rejects.toThrow();
    const stillActive = await operatorSession(new Request(`${origin}/api/v1/operator/session`,
      { headers: { Cookie: cookie(session) } }), context);
    expect(stillActive.status).toBe(200);
    await failAudit(null);
    await resetPassword(db, nextPassword, () => now);
    const ended = await operatorSession(new Request(`${origin}/api/v1/operator/session`,
      { headers: { Cookie: cookie(session) } }), context);
    expect(ended.status).toBe(401);
    const logout = await operatorLogout(post("/api/v1/operator/logout", { schema_version: 1 },
      { Cookie: cookie(session) }), context);
    expect(logout.status).toBe(204);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
  }, 30000);
});
