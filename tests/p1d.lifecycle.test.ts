import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, type Kysely } from "kysely";
import { createDb } from "../server/db/client";
import { migrate } from "../server/db/migrate";
import { parseDatabaseUrl } from "../server/config";
import type { Database } from "../server/db/types";
import { initOperator, login } from "../server/access/operator";
import { issueToken, revokeToken } from "../server/fleet/tokens";
import { enroll, type EnrollmentInput } from "../server/fleet/enrollment";
import { heartbeat } from "../server/fleet/heartbeat";
import { detailHost } from "../server/fleet/inventory";
import { revokeAgent } from "../server/fleet/revocation";
import { operatorRevokeAgent } from "../server/http/handlers";
import type { HttpContext } from "../server/http/response";
import { newCredential } from "../server/validation";

const url = process.env.TW_TEST_DATABASE_URL;
if (url && new URL(parseDatabaseUrl(url, "tinywarden")).pathname !== "/tinywarden_test_p1b") {
  throw new Error("P1.D tests require the owned test database");
}
const origin = "https://neutralisp.tinywarden.com";
const now = new Date("2026-09-28T17:00:00.000Z");
let db: Kysely<Database>;
let ctx: HttpContext;
let session: string;

function pending(credential: string, requestId = randomUUID()): EnrollmentInput {
  return { requestId, credential, hostname: "test-vm.example.org", osId: "debian",
    osVersion: "13", architecture: "amd64", agentVersion: "0.0.1" };
}
async function host(label: string) {
  const issued = await issueToken(db, session,
    { requestId: randomUUID(), label, targetAgentId: null }, () => now);
  const credential = newCredential("agent").value;
  const enrolled = await enroll(db, issued.token, pending(credential), ctx.config, () => now);
  return { ...enrolled, credential, label };
}
async function replacement(agentId: string, label: string) {
  return issueToken(db, session,
    { requestId: randomUUID(), label, targetAgentId: agentId }, () => now);
}
async function auditCount(action: string, agentId: string) {
  const found = await db.selectFrom("audit_events").select(({ fn }) => fn.count<string>("id").as("n"))
    .where("action", "=", action).where("target_agent_id", "=", agentId)
    .executeTakeFirstOrThrow();
  return Number(found.n);
}
async function latestAudit(action: string, agentId: string) {
  return db.selectFrom("audit_events").selectAll()
    .where("action", "=", action).where("target_agent_id", "=", agentId)
    .orderBy("occurred_at", "desc").orderBy("id", "desc")
    .executeTakeFirstOrThrow();
}
async function failAudit(action: string | null) {
  await sql`DELETE FROM tinywarden.test_audit_fail`.execute(db);
  if (action) await sql`INSERT INTO tinywarden.test_audit_fail(action) VALUES (${action})`.execute(db);
}

describe.skipIf(!url)("P1.D credential lifecycle on existing PostgreSQL", () => {
  beforeAll(async () => {
    db = createDb(url!);
    const { rows } = await sql<{ database_name: string; session_role: string;
      current_role: string; database_owner: string; schema_owner: string }>`
      SELECT current_database() AS database_name, session_user AS session_role,
        current_user AS current_role,
        (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database()) AS database_owner,
        (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'tinywarden') AS schema_owner
    `.execute(db);
    const target = rows[0];
    if (!target || target.database_name !== "tinywarden_test_p1b" ||
        target.session_role !== "tinywarden" || target.current_role !== "tinywarden" ||
        target.database_owner !== "tinywarden" || target.schema_owner !== "tinywarden") {
      throw new Error("P1.D fixture target or owner mismatch");
    }
    await migrate(url!, "tinywarden_test_p1b");
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
    await failAudit(null);
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
      tinywarden.operator_sessions, tinywarden.login_throttle, tinywarden.operators CASCADE`.execute(db);
    ctx = { db, clock: () => now, config: { origin, databaseUrl: url!,
      heartbeatIntervalSeconds: 60, staleAfterSeconds: 180 } };
    await initOperator(db, "synthetic-p1d-password-123", () => now);
    session = await login(db, "admin", "synthetic-p1d-password-123", () => now);
  });
  afterAll(async () => {
    if (db) {
      await failAudit(null);
      await sql`DROP TRIGGER IF EXISTS reject_test_audit ON tinywarden.audit_events`.execute(db);
      await sql`DROP FUNCTION IF EXISTS tinywarden.reject_test_audit()`.execute(db);
      await sql`DROP TABLE IF EXISTS tinywarden.test_audit_fail`.execute(db);
      await db.destroy();
    }
  });

  it("replaces once, preserves identity/cadence and resets contact before the new heartbeat", async () => {
    const original = await host("rotate-one");
    await heartbeat(db, original.credential, { sequence: 1, sentAt: now,
      agentVersion: "0.0.1" }, () => now);
    await expect(replacement(original.agent_id, "wrong-label"))
      .rejects.toMatchObject({ code: "agent_unavailable", status: 409 });
    const token = await replacement(original.agent_id, original.label);
    const next = newCredential("agent").value;
    const result = await enroll(db, token.token, pending(next), ctx.config, () => now);
    expect(result).toMatchObject({ host_id: original.host_id, agent_id: original.agent_id,
      generation: 2, heartbeat_interval_seconds: 60, stale_after_seconds: 180,
      duplicate: false });
    expect((await detailHost(db, session, original.host_id, () => now)).host)
      .toMatchObject({ contact_state: "unknown", last_contact_at: null, health_state: "unknown" });
    await expect(heartbeat(db, original.credential, { sequence: 2, sentAt: now,
      agentVersion: "0.0.1" }, () => now)).rejects.toMatchObject({ status: 401 });
    expect((await heartbeat(db, next, { sequence: 1, sentAt: now,
      agentVersion: "0.0.1" }, () => now)).sequence).toBe(1);
    expect(await auditCount("agent.credential_replaced", original.agent_id)).toBe(1);
    expect(await latestAudit("agent.credential_replaced", original.agent_id))
      .toMatchObject({ actor_kind: "agent", operator_id: null,
        agent_id: original.agent_id, target_agent_id: original.agent_id,
        host_id: original.host_id, token_id: token.token_id,
        from_generation: "1", to_generation: "2", revoked: null });
    expect(await latestAudit("agent.enrolled", original.agent_id))
      .toMatchObject({ actor_kind: "agent", agent_id: original.agent_id,
        target_agent_id: original.agent_id, host_id: original.host_id,
        from_generation: null, to_generation: null });
  });

  it("replays a saved replacement once; old-generation token and consumed-token replay fail", async () => {
    const original = await host("rotate-two");
    const first = await replacement(original.agent_id, original.label);
    const second = await replacement(original.agent_id, original.label);
    const next = newCredential("agent").value;
    const request = pending(next);
    const accepted = await enroll(db, first.token, request, ctx.config, () => now);
    const duplicate = await enroll(db, first.token, request, ctx.config, () => now);
    expect(duplicate).toMatchObject({ host_id: accepted.host_id,
      credential_id: accepted.credential_id, duplicate: true });
    await expect(enroll(db, second.token, pending(newCredential("agent").value),
      ctx.config, () => now)).rejects.toMatchObject({ code: "generation_changed", status: 409 });
    await revokeToken(db, session, first.token_id, () => now);
    await expect(enroll(db, first.token, request, ctx.config, () => now))
      .rejects.toMatchObject({ status: 401 });
    expect((await heartbeat(db, next, { sequence: 1, sentAt: now,
      agentVersion: "0.0.1" }, () => now)).sequence).toBe(1);
    expect(await auditCount("agent.credential_replaced", original.agent_id)).toBe(1);
  });

  it("serializes revocation with heartbeat and denies all later authority", async () => {
    const original = await host("revoke-one");
    const token = await replacement(original.agent_id, original.label);
    const denied = await operatorRevokeAgent(new Request(origin + "/api/v1/operator/agents/" +
      original.agent_id + "/revoke", { method: "POST", headers: {
        origin: "https://wrong.example.org", "content-type": "application/json",
        "x-tinywarden-request": "1", cookie: `__Host-tinywarden_session=${session}` },
      body: JSON.stringify({ schema_version: 1 }) }), original.agent_id, ctx);
    expect(denied.status).toBe(403);
    const [beat, revoked] = await Promise.allSettled([
      heartbeat(db, original.credential, { sequence: 1, sentAt: now,
        agentVersion: "0.0.1" }, () => now),
      revokeAgent(db, session, original.agent_id, () => now),
    ]);
    expect(revoked.status).toBe("fulfilled");
    if (beat.status === "rejected") expect(beat.reason.status).toBe(401);
    await expect(heartbeat(db, original.credential, { sequence: 2, sentAt: now,
      agentVersion: "0.0.1" }, () => now)).rejects.toMatchObject({ status: 401 });
    await expect(enroll(db, token.token, pending(newCredential("agent").value),
      ctx.config, () => now)).rejects.toMatchObject({ status: 401 });
    await expect(replacement(original.agent_id, original.label))
      .rejects.toMatchObject({ code: "agent_unavailable", status: 409 });
    await revokeAgent(db, session, original.agent_id, () => now);
    expect(await auditCount("agent.revoked", original.agent_id)).toBe(1);
    const operator = await db.selectFrom("operators").select("id")
      .where("singleton", "=", true).executeTakeFirstOrThrow();
    expect(await latestAudit("agent.revoked", original.agent_id))
      .toMatchObject({ actor_kind: "operator", operator_id: operator.id,
        agent_id: null, target_agent_id: original.agent_id,
        host_id: original.host_id, token_id: null, revoked: true });
    expect((await detailHost(db, session, original.host_id, () => now)).host.contact_state).toBe("revoked");
  });

  it("serializes replacement against revocation without resurrecting authority", async () => {
    const original = await host("race-two");
    const token = await replacement(original.agent_id, original.label);
    const next = newCredential("agent").value;
    const [rotated, revoked] = await Promise.allSettled([
      enroll(db, token.token, pending(next), ctx.config, () => now),
      revokeAgent(db, session, original.agent_id, () => now),
    ]);
    expect(revoked.status).toBe("fulfilled");
    if (rotated.status === "rejected") expect(rotated.reason.status).toBe(401);
    const active = await db.selectFrom("agent_credentials").select("id")
      .where("agent_id", "=", original.agent_id).where("revoked_at", "is", null).execute();
    expect(active).toHaveLength(0);
    expect((await detailHost(db, session, original.host_id, () => now)).host.contact_state).toBe("revoked");
    expect(await auditCount("agent.revoked", original.agent_id)).toBe(1);
  });

  it("rolls back both lifecycle roots when the audit insert fails", async () => {
    const original = await host("audit-one");
    const token = await replacement(original.agent_id, original.label);
    const next = newCredential("agent").value;
    const request = pending(next);
    await failAudit("agent.credential_replaced");
    await expect(enroll(db, token.token, request, ctx.config, () => now)).rejects.toThrow();
    expect((await db.selectFrom("agents").select("current_generation")
      .where("id", "=", original.agent_id).executeTakeFirstOrThrow()).current_generation).toBe("1");
    expect((await db.selectFrom("enrollment_tokens").select("consumed_at")
      .where("id", "=", token.token_id).executeTakeFirstOrThrow()).consumed_at).toBeNull();
    await failAudit(null);
    await enroll(db, token.token, request, ctx.config, () => now);
    await failAudit("agent.revoked");
    await expect(revokeAgent(db, session, original.agent_id, () => now)).rejects.toThrow();
    expect((await db.selectFrom("agents").select("revoked_at")
      .where("id", "=", original.agent_id).executeTakeFirstOrThrow()).revoked_at).toBeNull();
    await failAudit(null);
    await revokeAgent(db, session, original.agent_id, () => now);
    expect(await auditCount("agent.revoked", original.agent_id)).toBe(1);
  });
});
