import { createHash, randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { sql, type Kysely } from "kysely";
import type { Database } from "../server/db/types";
import { parseDatabaseUrl, type AppConfig } from "../server/config";
import { newCredential } from "../server/validation";
import { updateDiskDefinition } from "../server/checks/policy";
import { operatorDiskDefinition, operatorHostDiskPolicy, agentAssignments,
  operatorUpdateDiskDefinition, operatorSetHostDiskPolicy, agentHeartbeat } from "../server/http/handlers";
import type { HttpContext } from "../server/http/response";
import { body, makeRequest, setupFixture } from "./p2a.fixture";

const url = process.env.TW_TEST_DATABASE_URL;
if (url && new URL(parseDatabaseUrl(url, "tinywarden")).pathname !== "/tinywarden_test_p1b") {
  throw new Error("P2.A tests require the owned tinywarden_test_p1b database");
}
const origin = "https://warden.example.org";
const config: AppConfig = { origin, databaseUrl: url ?? "", heartbeatIntervalSeconds: 60,
  staleAfterSeconds: 180 };
let db: Kysely<Database>;
let ctx: HttpContext;
const started = new Date(Date.now() + 3600_000);
let now = new Date(started);
let session = "", agentCredential = "", hostId = "", agentId = "";
const req = makeRequest(origin);
const definitionPath = "/api/v1/operator/check-definitions/disk-local";
const hostPath = () => `/api/v1/operator/hosts/${hostId}/checks/disk-local`;
const assignmentPath = "/api/v1/agent/assignments";
async function defaults() {
  return body(await operatorDiskDefinition(req(definitionPath, undefined, undefined, session), ctx));
}
async function hostPolicy() {
  return body(await operatorHostDiskPolicy(req(hostPath(), undefined, undefined, session), hostId, ctx));
}
async function editDefault(expected: number, values: [number, number, number], id = randomUUID()) {
  return operatorUpdateDiskDefinition(req(definitionPath, { schema_version: 1, request_id: id,
    expected_revision: expected, warning_percent: values[0], critical_percent: values[1],
    interval_seconds: values[2] }, undefined, session), ctx);
}
async function editHost(expectedPolicy: number, expectedDefault: number,
  mode: "inherit" | "override", values?: [number, number, number], id = randomUUID()) {
  return operatorSetHostDiskPolicy(req(hostPath(), { schema_version: 1, request_id: id,
    expected_policy_version: expectedPolicy, expected_default_revision: expectedDefault, mode,
    ...(values ? { warning_percent: values[0], critical_percent: values[1], interval_seconds: values[2] } : {})
  }, undefined, session), hostId, ctx);
}
async function fetch(capabilities: string[], known: unknown = null, credential = agentCredential) {
  return agentAssignments(req(assignmentPath, { schema_version: 1, agent_version: "0.0.1",
    capabilities, known_assignment: known }, credential), ctx);
}

describe.skipIf(!url)("P2.A checks contract on guarded synthetic database", () => {
  beforeAll(async () => {
    ({ db, ctx, session, agentCredential, hostId, agentId } = await setupFixture(url!, config, () => now));
  });
  afterAll(async () => { if (db) await db.destroy(); });

  it("A01 keeps the baseline seed and schema bounds", async () => {
    const first = await defaults();
    expect(first.revision).toBeGreaterThanOrEqual(1);
    expect(first.capability).toBe("disk_usage.v1");
    const seed = await sql<{ n: string }>`SELECT count(*)::text AS n
      FROM tinywarden.check_definition_revisions WHERE definition_key='disk-local'
      AND revision=1 AND warning_percent=85 AND critical_percent=95
      AND interval_seconds=300`.execute(db);
    expect(seed.rows[0]?.n).toBe("1");
    await expect(sql`INSERT INTO tinywarden.check_definition_revisions
      (definition_key,revision,warning_percent,critical_percent,interval_seconds,
        selector_version,evaluator_version,created_at)
      VALUES ('disk-local',99999,95,85,300,1,1,clock_timestamp())`.execute(db))
      .rejects.toMatchObject({ code: "23514" });
  });

  it("A05-A06 delivers exact snapshots, validates capability and preserves heartbeat", async () => {
    const missing = await fetch([]);
    expect(missing.status).toBe(200);
    const first = await body(missing);
    expect(first.assignment.applicability).toBe("missing_capability");
    expect(first.assignment.checks).toEqual([]);
    const ready = await body(await fetch(["disk_usage.v1"]));
    expect(ready.revision).toBe(first.revision + 1);
    expect(ready.assignment.checks).toEqual([{ kind: "disk_usage" }]);
    const e = ready.assignment.effective;
    const digest = createHash("sha256").update(JSON.stringify([1, hostId, agentId, 1,
      "disk-local", ready.revision, ready.assignment.definition_revision,
      ready.assignment.policy_version, ready.assignment.mode, "ready", "disk_usage.v1",
      1, 1, e.warning_percent, e.critical_percent, e.interval_seconds, 10,
      e.stale_after_seconds])).digest("hex");
    expect(ready.digest).toBe(digest);
    const known = { id: ready.assignment_id, revision: ready.revision, digest: ready.digest };
    const omitted = await body(await fetch(["disk_usage.v1"], known));
    expect(omitted.not_modified).toBe(true);
    expect(omitted.assignment).toBeUndefined();
    const noCapability = await fetch(["disk_usage.v1", "disk_usage.v1"]);
    expect(noCapability.status).toBe(400);
    expect((await fetch(Array.from({ length: 9 }, (_, i) => `cap${i}`))).status).toBe(400);
    await db.updateTable("hosts").set({ architecture: "arm64" }).where("id", "=", hostId).execute();
    expect((await body(await fetch(["disk_usage.v1"]))).assignment.applicability)
      .toBe("unsupported_architecture");
    await db.updateTable("hosts").set({ architecture: "amd64" }).where("id", "=", hostId).execute();
    const heartbeat = await agentHeartbeat(req("/api/v1/agent/heartbeat", { schema_version: 1,
      sequence: 1, sent_at: now.toISOString(), agent_version: "0.0.1" }, agentCredential), ctx);
    expect(heartbeat.status).toBe(200);
  });

  it("A02-A04 resolves edits, provenance, replay and concurrent fetches", async () => {
    const initial = await defaults();
    const initialHost = await hostPolicy();
    expect(initialHost.mode).toBe("inherit");
    const [one, two] = await Promise.all([editDefault(initial.revision, [84, 94, 300]),
      editDefault(initial.revision, [83, 93, 300])]);
    expect([one.status, two.status].sort()).toEqual([200, 409]);
    const current = await defaults();
    expect(current.revision).toBe(initial.revision + 1);
    const fetched = await Promise.all([fetch(["disk_usage.v1"]), fetch(["disk_usage.v1"])]);
    const resolved = await Promise.all(fetched.map(body));
    expect(resolved[0]!.assignment_id).toBe(resolved[1]!.assignment_id);
    expect(resolved[0]!.revision).toBe(resolved[1]!.revision);
    const values: [number, number, number] = [current.warning_percent, current.critical_percent,
      current.interval_seconds];
    const override = await editHost(0, current.revision, "override", values);
    expect(override.status).toBe(200);
    const overrideBody = await body(override);
    expect(overrideBody.changed).toBe(true);
    const pinned = await body(await fetch(["disk_usage.v1"]));
    expect(pinned.assignment.mode).toBe("override");
    const noopId = randomUUID();
    const noop = await body(await editHost(1, current.revision, "override", values, noopId));
    expect(noop.changed).toBe(false);
    const newer = await body(await editDefault(current.revision, [82, 92, 300]));
    expect(newer.revision).toBe(current.revision + 1);
    const retry = await body(await editHost(1, current.revision, "override", values, noopId));
    expect(retry).toMatchObject({ changed: false, duplicate: true, policy_version: 1 });
    const conflict = await editHost(1, current.revision, "inherit");
    expect(conflict.status).toBe(409);
    const stillPinned = await body(await fetch(["disk_usage.v1"]));
    expect(stillPinned.assignment_id).toBe(pinned.assignment_id);
    const reset = await editHost(1, newer.revision, "inherit");
    expect(reset.status).toBe(200);
    const inherited = await body(await fetch(["disk_usage.v1"]));
    expect(inherited.assignment.definition_revision).toBe(newer.revision);
    expect(inherited.assignment.mode).toBe("inherit");
  });

  it("A01 rejects mismatched snapshot generation and pinned policy source", async () => {
    await expect(sql`INSERT INTO tinywarden.check_assignment_snapshots
      (id,host_id,definition_key,agent_id,generation,revision,definition_revision,
        policy_version,mode,applicability,warning_percent,critical_percent,interval_seconds,
        selector_version,evaluator_version,created_at,payload_digest)
      SELECT gen_random_uuid(),host_id,definition_key,agent_id,generation+100,
        revision+100,definition_revision,policy_version,mode,applicability,
        warning_percent,critical_percent,interval_seconds,selector_version,
        evaluator_version,created_at,payload_digest
      FROM tinywarden.check_assignment_snapshots WHERE host_id=${hostId}
      ORDER BY revision DESC LIMIT 1`.execute(db)).rejects.toMatchObject({ code: "23503" });
    await expect(sql`INSERT INTO tinywarden.host_check_policy_revisions
      (host_id,definition_key,version,mode,warning_percent,critical_percent,
        interval_seconds,pinned_definition_revision,created_at)
      VALUES (${hostId},'disk-local',100,'override',80,90,300,99999,clock_timestamp())`
      .execute(db)).rejects.toMatchObject({ code: "23503" });
  });

  it("A04 rejects changed replay, wrong origin, unknown fields and unauthorized edits", async () => {
    const current = await defaults();
    const id = randomUUID();
    const values: [number, number, number] = [current.warning_percent, current.critical_percent,
      current.interval_seconds];
    expect((await editDefault(current.revision, values, id)).status).toBe(200);
    const changed = await editDefault(current.revision, [81, 91, 300], id);
    expect((await body(changed)).error.code).toBe("request_conflict");
    const missingHost = randomUUID();
    const acrossRoots = await operatorSetHostDiskPolicy(req(
      `/api/v1/operator/hosts/${missingHost}/checks/disk-local`, {
        schema_version: 1, request_id: id, expected_policy_version: 0,
        expected_default_revision: current.revision, mode: "inherit"
      }, undefined, session), missingHost, ctx);
    expect((await body(acrossRoots)).error.code).toBe("request_conflict");
    const wrong = req(definitionPath, { schema_version: 1, request_id: randomUUID(),
      expected_revision: current.revision, warning_percent: 81, critical_percent: 91,
      interval_seconds: 300 }, undefined, session);
    wrong.headers.set("Origin", "https://other.example.org");
    expect((await operatorUpdateDiskDefinition(wrong, ctx)).status).toBe(403);
    const unknown = await operatorUpdateDiskDefinition(req(definitionPath, {
      schema_version: 1, request_id: randomUUID(), expected_revision: current.revision,
      warning_percent: 81, critical_percent: 91, interval_seconds: 300, extra: 1
    }, undefined, session), ctx);
    expect(unknown.status).toBe(400);
    expect((await operatorUpdateDiskDefinition(req(definitionPath, {
      schema_version: 1, request_id: randomUUID(), expected_revision: current.revision,
      warning_percent: 81, critical_percent: 91, interval_seconds: 300
    }), ctx)).status).toBe(401);
  });

  it("A01/A04 keeps an edit and its audit atomic when audit insertion fails", async () => {
    await sql`CREATE TABLE IF NOT EXISTS tinywarden.test_p2_audit_fail (action text PRIMARY KEY)`.execute(db);
    await sql`CREATE OR REPLACE FUNCTION tinywarden.reject_p2_audit() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        IF EXISTS (SELECT 1 FROM tinywarden.test_p2_audit_fail WHERE action = NEW.action) THEN
          RAISE EXCEPTION 'synthetic audit rejection';
        END IF;
        RETURN NEW;
      END $$`.execute(db);
    await sql`DROP TRIGGER IF EXISTS reject_p2_audit ON tinywarden.audit_events`.execute(db);
    await sql`CREATE TRIGGER reject_p2_audit BEFORE INSERT ON tinywarden.audit_events
      FOR EACH ROW EXECUTE FUNCTION tinywarden.reject_p2_audit()`.execute(db);
    const current = await defaults();
    await sql`INSERT INTO tinywarden.test_p2_audit_fail(action)
      VALUES ('check.definition_updated') ON CONFLICT DO NOTHING`.execute(db);
    try {
      const failed = await editDefault(current.revision, [80, 90, 300]);
      expect(failed.status).toBe(503);
      expect((await defaults()).revision).toBe(current.revision);
    } finally {
      await sql`DELETE FROM tinywarden.test_p2_audit_fail`.execute(db);
      await sql`DROP TRIGGER IF EXISTS reject_p2_audit ON tinywarden.audit_events`.execute(db);
    }
  });

  it("A03 rejects a clock before the current revision was created", async () => {
    const current = await defaults();
    const source = await db.selectFrom("check_definition_revisions").select("created_at")
      .where("definition_key", "=", "disk-local")
      .where("revision", "=", String(current.revision)).executeTakeFirstOrThrow();
    const past = new Date(source.created_at.getTime() - 100);
    const actor = await db.selectFrom("operators").select(["id", "auth_version"])
      .executeTakeFirstOrThrow();
    const login = newCredential("session");
    await db.insertInto("operator_sessions").values({ id: login.id, operator_id: actor.id,
      secret_digest: login.digest, auth_version: actor.auth_version,
      issued_at: new Date(past.getTime() - 1000), last_seen_at: new Date(past.getTime() - 1000),
      expires_at: new Date(past.getTime() + 3600_000) }).execute();
    await expect(updateDiskDefinition(db, login.value, { requestId: randomUUID(),
      expectedRevision: current.revision, values: { warning_percent: 78,
        critical_percent: 88, interval_seconds: 300 } }, () => past))
      .rejects.toMatchObject({ code: "temporarily_unavailable", status: 503 });
    expect((await defaults()).revision).toBe(current.revision);
  });

  it("A03 rechecks session expiry and credential revocation after row-lock waits", async () => {
    const current = await defaults();
    let waiting: Promise<Response> | undefined;
    await db.transaction().execute(async (trx) => {
      await trx.selectFrom("check_definitions").select("definition_key")
        .where("definition_key", "=", "disk-local").forUpdate().executeTakeFirstOrThrow();
      waiting = editDefault(current.revision, [79, 89, 300]);
      await new Promise((resolve) => setTimeout(resolve, 100));
      now = new Date(started.getTime() + 3600_000);
    });
    expect((await waiting!).status).toBe(401);
    now = new Date(started.getTime() + 60_000);
    expect((await defaults()).revision).toBe(current.revision);
    let fetching: Promise<Response> | undefined;
    await db.transaction().execute(async (trx) => {
      await trx.selectFrom("hosts").select("id").where("id", "=", hostId)
        .forUpdate().executeTakeFirstOrThrow();
      fetching = fetch(["disk_usage.v1"]);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const credentialId = agentCredential.slice(5, 41);
      await trx.updateTable("agent_credentials").set({ revoked_at: now })
        .where("id", "=", credentialId).execute();
    });
    expect((await fetching!).status).toBe(401);
    const replacementHost = randomUUID(), replacementAgent = randomUUID();
    const old = newCredential("agent"), newer = newCredential("agent");
    await db.insertInto("hosts").values({ id: replacementHost, label: "P2 replacement fixture",
      reported_hostname: "replace.example.org", os_id: "debian", os_version: "13",
      architecture: "amd64", enrolled_agent_version: "0.0.1",
      created_at: new Date(now.getTime() - 1000) }).execute();
    await db.insertInto("agents").values({ id: replacementAgent, host_id: replacementHost,
      current_generation: 1, enrolled_at: new Date(now.getTime() - 1000),
      revoked_at: null, heartbeat_interval_seconds: 60, stale_after_seconds: 180 }).execute();
    await db.insertInto("agent_credentials").values({ id: old.id, agent_id: replacementAgent,
      generation: 1, secret_digest: old.digest, created_at: new Date(now.getTime() - 1000),
      revoked_at: null, last_sequence: 0, last_fingerprint: null, accepted_at: null,
      sent_at: null, agent_version: null }).execute();
    let replacing: Promise<Response> | undefined;
    await db.transaction().execute(async (trx) => {
      await trx.selectFrom("hosts").select("id").where("id", "=", replacementHost)
        .forUpdate().executeTakeFirstOrThrow();
      replacing = fetch(["disk_usage.v1"], null, old.value);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await trx.updateTable("agent_credentials").set({ revoked_at: now })
        .where("id", "=", old.id).execute();
      await trx.insertInto("agent_credentials").values({ id: newer.id, agent_id: replacementAgent,
        generation: 2, secret_digest: newer.digest, created_at: now,
        revoked_at: null, last_sequence: 0, last_fingerprint: null, accepted_at: null,
        sent_at: null, agent_version: null }).execute();
      await trx.updateTable("agents").set({ current_generation: 2 })
        .where("id", "=", replacementAgent).execute();
    });
    expect((await replacing!).status).toBe(401);
  });
});
