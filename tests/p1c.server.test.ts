import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, type Kysely } from "kysely";
import { createDb } from "../server/db/client";
import { parseDatabaseUrl } from "../server/config";
import type { Database } from "../server/db/types";
import { initOperator, login } from "../server/access/operator";
import { issueToken } from "../server/fleet/tokens";
import { enroll } from "../server/fleet/enrollment";
import { detailHost, listHosts, listOptions } from "../server/fleet/inventory";
import { agentHeartbeat, operatorHosts } from "../server/http/handlers";
import type { HttpContext } from "../server/http/response";
import { newCredential } from "../server/validation";

const url = process.env.TW_TEST_DATABASE_URL;
if (url && new URL(parseDatabaseUrl(url, "tinywarden")).pathname !== "/tinywarden_test_p1b") {
  throw new Error("P1.C tests require the owned test database");
}
const origin = "https://neutralisp.tinywarden.com";
let now = new Date("2026-09-28T15:00:00.000Z");
let db: Kysely<Database>;
let ctx: HttpContext;
let session: string;
let agentOne: { host_id: string; agent_id: string; credential: string };
let agentTwo: { host_id: string; agent_id: string; credential: string };

async function addHost(label: string) {
  const issued = await issueToken(db, session,
    { requestId: randomUUID(), label, targetAgentId: null }, () => now);
  const credential = newCredential("agent");
  const result = await enroll(db, issued.token, { requestId: randomUUID(),
    credential: credential.value, hostname: `${label}.example.org`, osId: "debian",
    osVersion: "13", architecture: "amd64", agentVersion: "0.0.1" }, ctx.config, () => now);
  return { host_id: result.host_id, agent_id: result.agent_id, credential: credential.value };
}

function request(credential: string | undefined, body: unknown): Request {
  return new Request(`${origin}/api/v1/agent/heartbeat`, { method: "POST",
    headers: { "content-type": "application/json",
      ...(credential ? { authorization: `Bearer ${credential}` } : {}) },
    body: JSON.stringify(body) });
}

function body(sequence: number, sentAt = now.toISOString()) {
  return { schema_version: 1, sequence, sent_at: sentAt, agent_version: "0.0.1" };
}

async function errorCode(response: Response): Promise<string> {
  return (await response.json()).error.code;
}

describe.skipIf(!url)("P1.C heartbeat and inventory on existing PostgreSQL", () => {
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
      throw new Error("P1.C fixture target or owner mismatch");
    }
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
    ctx = { db, clock: () => now, config: { origin, databaseUrl: url!,
      heartbeatIntervalSeconds: 60, staleAfterSeconds: 180 } };
    await initOperator(db, "synthetic-p1c-password-123", () => now);
    session = await login(db, "admin", "synthetic-p1c-password-123", () => now);
    agentOne = await addHost("first");
    now = new Date(now.getTime() + 1);
    agentTwo = await addHost("second");
  });
  afterAll(async () => { if (db) await db.destroy(); });

  it("shows unknown contact and denies anonymous inventory", async () => {
    const denied = await operatorHosts(new Request(`${origin}/api/v1/operator/hosts`), ctx);
    expect(denied.status).toBe(401);
    const page = await listHosts(db, session, { limit: 1 }, () => now);
    expect(page.hosts).toHaveLength(1);
    expect(page.hosts[0]?.contact_state).toBe("unknown");
    expect(page.hosts[0]?.health_state).toBe("unknown");
    expect(page.next_cursor).toBeTruthy();
    const second = await listHosts(db, session, { limit: 1, cursor: page.next_cursor! }, () => now);
    expect(second.hosts).toHaveLength(1);
    expect(second.hosts[0]?.host_id).not.toBe(page.hosts[0]?.host_id);
    expect(second.next_cursor).toBeNull();
    expect(() => listOptions("?limit=51")).toThrow();
    expect(() => listOptions("?limit=2&limit=3")).toThrow();
    expect(() => listOptions("?cursor=bad" )).toThrow();
  });

  it("stores one heartbeat, ignores identical retry and rejects sequence changes", async () => {
    const initial = body(1);
    const first = await agentHeartbeat(request(agentOne.credential, initial), ctx);
    expect(first.status).toBe(200);
    const accepted = await first.json();
    expect(accepted).toMatchObject({ schema_version: 1, sequence: 1, duplicate: false,
      heartbeat_interval_seconds: 60, stale_after_seconds: 180 });
    await db.destroy();
    db = createDb(url!);
    ctx.db = db;
    now = new Date(now.getTime() + 10_000);
    const replay = await agentHeartbeat(request(agentOne.credential, initial), ctx);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ sequence: 1, duplicate: true,
      accepted_at: accepted.accepted_at });
    const changed = await agentHeartbeat(request(agentOne.credential, body(1)), ctx);
    expect([changed.status, await errorCode(changed)]).toEqual([409, "sequence_conflict"]);
    const lower = await agentHeartbeat(request(agentOne.credential, body(0)), ctx);
    expect(lower.status).toBe(400);
    const next = await agentHeartbeat(request(agentOne.credential, body(2)), ctx);
    expect(next.status).toBe(200);
    const nextPayload = await next.json();
    now = new Date(now.getTime() - 1_000);
    const backwards = await agentHeartbeat(request(agentOne.credential, body(3)), ctx);
    expect(backwards.status).toBe(200);
    expect((await backwards.json()).accepted_at).toBe(nextPayload.accepted_at);
    now = new Date(now.getTime() + 1_000);
    const older = await agentHeartbeat(request(agentOne.credential, body(2)), ctx);
    expect([older.status, await errorCode(older)]).toEqual([409, "sequence_superseded"]);
    const stored = await db.selectFrom("agent_credentials")
      .select(["last_sequence", "accepted_at"]).where("agent_id", "=", agentOne.agent_id)
      .executeTakeFirstOrThrow();
    expect(stored.last_sequence).toBe("3");
    expect(stored.accepted_at?.toISOString()).toBe(nextPayload.accepted_at);
  });

  it("rejects absent, wrong, type-confused and injected host authority", async () => {
    const before = await db.selectFrom("agent_credentials").select("last_sequence")
      .where("agent_id", "=", agentTwo.agent_id).executeTakeFirstOrThrow();
    const cases = [
      request(undefined, body(1)),
      request(newCredential("agent").value, body(1)),
      request(newCredential("enrollment").value, body(1)),
      request(agentOne.credential, { ...body(4), host_id: agentTwo.host_id }),
      request(agentTwo.credential, { ...body(1), sent_at: "2026-02-30T00:00:00.000Z" }),
      request(agentTwo.credential, { ...body(1), sequence: "1" }),
    ];
    for (const entry of cases) expect((await agentHeartbeat(entry, ctx)).status).toBeGreaterThanOrEqual(400);
    const after = await db.selectFrom("agent_credentials").select("last_sequence")
      .where("agent_id", "=", agentTwo.agent_id).executeTakeFirstOrThrow();
    expect(after.last_sequence).toBe(before.last_sequence);
  });

  it("serializes concurrent newer and older deliveries", async () => {
    now = new Date(now.getTime() + 1_000);
    const [four, five] = await Promise.all([
      agentHeartbeat(request(agentOne.credential, body(4)), ctx),
      agentHeartbeat(request(agentOne.credential, body(5)), ctx),
    ]);
    expect([200, 409]).toContain(four.status);
    expect(five.status).toBe(200);
    const stored = await db.selectFrom("agent_credentials").select("last_sequence")
      .where("agent_id", "=", agentOne.agent_id).executeTakeFirstOrThrow();
    expect(stored.last_sequence).toBe("5");
  });

  it("derives current, stale and revoked at exact server-time boundaries", async () => {
    const stored = await db.selectFrom("agent_credentials").select("accepted_at")
      .where("agent_id", "=", agentOne.agent_id).executeTakeFirstOrThrow();
    const contact = stored.accepted_at!;
    await db.updateTable("operator_sessions").set({ last_seen_at: new Date("2026-09-28T15:00:00.000Z") })
      .execute();
    const backwards = await detailHost(db, session, agentOne.host_id,
      () => new Date(contact.getTime() - 1));
    expect(backwards.host.contact_state).toBe("unknown");
    const before = await detailHost(db, session, agentOne.host_id,
      () => new Date(contact.getTime() + 179_999));
    expect(before.host.contact_state).toBe("current");
    expect(before.host.health_state).toBe("unknown");
    const edge = await detailHost(db, session, agentOne.host_id,
      () => new Date(contact.getTime() + 180_000));
    expect(edge.host.contact_state).toBe("stale");
    await db.updateTable("agents").set({ revoked_at: contact })
      .where("id", "=", agentOne.agent_id).execute();
    const revoked = await detailHost(db, session, agentOne.host_id,
      () => new Date(contact.getTime() + 180_000));
    expect(revoked.host.contact_state).toBe("revoked");
    expect(revoked.host.health_state).toBe("unknown");
    const denied = await agentHeartbeat(request(agentOne.credential, body(6)), ctx);
    expect(denied.status).toBe(401);
  });

  it("reports a database read failure as unavailable, never an empty fleet", async () => {
    const unavailable = createDb("postgresql://tinywarden@localhost/tinywarden_test_p1b?host=/nonexistent/tinywarden-p1c-socket");
    const response = await operatorHosts(new Request(origin + "/api/v1/operator/hosts", {
      headers: { Cookie: "__Host-tinywarden_session=" + session },
    }), { ...ctx, db: unavailable });
    await unavailable.destroy();
    expect(response.status).toBe(503);
    const result = await response.json();
    expect(result.error.code).toBe("temporarily_unavailable");
    expect(result.hosts).toBeUndefined();
  });
});
