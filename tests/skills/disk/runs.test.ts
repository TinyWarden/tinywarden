import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { sql, type Kysely } from "kysely";
import type { Database } from "../../../server/db/types";
import type { AppConfig } from "../../../server/config";
import type { HttpContext } from "../../../server/http/response";
import { createDb } from "../../../server/db/client";
import { migrate } from "../../../server/db/migrate";
import { classifyMount, diskRunInput, type RunMount } from "../../../server/skills/results/disk-runs";
import { readDiskHealth } from "../../../server/skills/results/disk-health";
import { agentAssignments, agentDiskRun, operatorDiskDefinition,
  operatorUpdateDiskDefinition, operatorSetHostDiskPolicy } from "../../../server/http/handlers";
import { body, makeRequest, setupFixture } from "./fixture";

const url = process.env.TW_TEST_DATABASE_URL;
if (url && new URL(url).pathname !== "/tinywarden_test_p1b") {
  throw new Error("P2.B tests require the guarded tinywarden_test_p1b database");
}
const origin = "https://warden.example.org";
const config: AppConfig = { origin, databaseUrl: url ?? "", heartbeatIntervalSeconds: 60,
  staleAfterSeconds: 180 };
const req = makeRequest(origin);
let db: Kysely<Database>, ctx: HttpContext, session = "", credential = "", hostId = "";
const baseTime = Date.now() + 3600_000;
let now = new Date(baseTime);
let assignmentId = "", interval = 300, initialWarning = 85, initialCritical = 95;
let sequence = 1;
async function resetGuardedDatabase() {
  const raw = createDb(url!);
  try {
    const identity = await sql<{ db: string; role: string; owner: string }>`
      SELECT current_database() AS db, session_user AS role,
        (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) AS owner`
      .execute(raw);
    if (identity.rows[0]?.db !== "tinywarden_test_p1b" ||
        identity.rows[0]?.role !== "tinywarden" || identity.rows[0]?.owner !== "tinywarden") {
      throw new Error("P2.B destructive test target mismatch");
    }
    await sql`DROP SCHEMA IF EXISTS tinywarden CASCADE`.execute(raw);
    await sql`CREATE SCHEMA tinywarden AUTHORIZATION tinywarden`.execute(raw);
  } finally { await raw.destroy(); }
  await migrate(url!, "tinywarden_test_p1b");
}
const mount = (total: string, free: string, available: string, writable = true): RunMount => ({
  mount_id: 40, mount_path: "/", mount_root: "/", filesystem_type: "ext4",
  kind: "local", writable, shared_capacity: false, reason: "none",
  total_bytes: total, free_bytes: free, available_bytes: available });
function run(options: { id?: string; seq?: number; assignment?: string; coverage?: string;
  reason?: string; mounts?: RunMount[]; finished?: string } = {}) {
  return { schema_version: 1, run_id: options.id ?? randomUUID(),
    run_sequence: options.seq ?? sequence++, assignment_id: options.assignment ?? assignmentId,
    started_at: new Date(baseTime + 1000).toISOString(),
    finished_at: options.finished ?? new Date(baseTime + 2000).toISOString(),
    coverage: options.coverage ?? "complete", reason: options.reason ?? "none",
    excluded_kernel: 2, excluded_remote: 1, dropped_runs: 0,
    mounts: options.mounts ?? [mount("100", "15", "15")] };
}
async function post(value: unknown, token = credential) {
  return agentDiskRun(req("/api/v1/agent/disk-runs", value, token), ctx);
}
async function health() { return readDiskHealth(db, session, hostId, () => now); }
async function contact(at: Date) {
  await db.updateTable("agent_credentials").set({ last_sequence: 1,
    last_fingerprint: Buffer.alloc(32, 7), accepted_at: at, last_contact_at:at, sent_at: at,
    agent_version: "0.0.1" })
    .where("agent_id", "=", (await db.selectFrom("agents").select("id")
      .where("host_id", "=", hostId).executeTakeFirstOrThrow()).id).execute();
}

describe.skipIf(!url)("P2.B run ingest and health on guarded synthetic database", () => {
  beforeAll(async () => {
    await resetGuardedDatabase();
    ({ db, ctx, session, agentCredential: credential, hostId } =
      await setupFixture(url!, config, () => now));
    const delivery = await body(await agentAssignments(req("/api/v1/agent/assignments",
      { schema_version: 1, agent_version: "0.0.1", capabilities: ["disk_usage.v1"],
        known_assignment: null }, credential), ctx));
    assignmentId = delivery.assignment_id;
    interval = delivery.assignment.effective.interval_seconds;
    initialWarning = delivery.assignment.effective.warning_percent;
    initialCritical = delivery.assignment.effective.critical_percent;
  });
  afterAll(async () => {
    if (db) await db.destroy();
    await resetGuardedDatabase();
  });

  it("B02 evaluates exact integer boundaries, reserved space, uint64 and invalid counters", () => {
    expect(classifyMount(mount("100", "15", "15"), 85, 95)).toBe("warning");
    expect(classifyMount(mount("100", "5", "5"), 85, 95)).toBe("critical");
    expect(classifyMount(mount("100", "20", "10"), 85, 95)).toBe("warning");
    expect(classifyMount(mount("10000", "1505", "1505"), 85, 95)).toBe("healthy");
    expect(classifyMount(mount("18446744073709551615", "1844674407370955161",
      "1844674407370955161"), 85, 95)).toBe("warning");
    expect(classifyMount(mount("100", "5", "5", false), 85, 95)).toBe("informational");
    expect(() => diskRunInput(run({ mounts: [mount("100", "101", "1")] }))).toThrow();
    expect(() => diskRunInput(run({ mounts: [mount("0", "0", "0")] }))).toThrow();
    expect(() => diskRunInput(run({ mounts: [mount("18446744073709551616", "1", "1")] }))).toThrow();
  });

  it("B04 has no healthy first-run or no-contact projection", async () => {
    await db.updateTable("agent_credentials").set({last_contact_at:null}).execute();
    const first = await health();
    expect(first.state).toBe("unknown");
    expect(first.reason).toBe("contact_unavailable");
    expect(first.history).toHaveLength(0);
    await contact(now);
    const waiting = await health();
    expect(waiting.state).toBe("unknown");
    expect(waiting.reason).toBe("no_observation");
  });

  it("B03 exact retry keeps first receipt; changed ID or sequence conflicts; invalid scope fails", async () => {
    const input = run({ seq: 1 });
    now = new Date(baseTime + 3000);
    const first = await post(input);
    expect(first.status).toBe(200);
    const received = await body(first);
    expect(received.duplicate).toBe(false);
    now = new Date(baseTime + 4000);
    const same = await body(await post(input));
    expect(same.duplicate).toBe(true);
    expect(same.received_at).toBe(received.received_at);
    expect((await body(await post({ ...input, dropped_runs: 1 }))).error.code).toBe("run_conflict");
    expect((await body(await post({ ...input, run_id: randomUUID() }))).error.code).toBe("run_conflict");
    const missingAgent = await setupFixture(url!, config, () => now);
    try {
      const missing = await agentDiskRun(req("/api/v1/agent/disk-runs",
        { ...input, run_id: randomUUID(), assignment_id: randomUUID() },
        missingAgent.agentCredential), missingAgent.ctx);
      expect((await body(missing)).error.code).toBe("assignment_unknown");
    } finally { await missingAgent.db.destroy(); }
    const other = await setupFixture(url!, config, () => now);
    const otherDelivery = await body(await agentAssignments(req("/api/v1/agent/assignments",
      { schema_version: 1, agent_version: "0.0.1", capabilities: ["disk_usage.v1"],
        known_assignment: null }, other.agentCredential), other.ctx));
    expect((await body(await post({ ...input, run_id: randomUUID(), run_sequence: 2,
      assignment_id: otherDelivery.assignment_id }))).error.code).toBe("assignment_unknown");
    await other.db.destroy();
    const count = await db.selectFrom("disk_runs").select("id").where("id", "=", input.run_id).execute();
    expect(count).toHaveLength(1);
    const largeDrop = { ...run({ seq: 2, coverage: "incomplete",
      reason: "queue_overflow", mounts: [] }), dropped_runs: Number.MAX_SAFE_INTEGER };
    expect((await post(largeDrop)).status).toBe(200);
    expect((await db.selectFrom("disk_runs").select("dropped_runs")
      .where("id", "=", largeDrop.run_id).executeTakeFirstOrThrow()).dropped_runs)
      .toBe(String(Number.MAX_SAFE_INTEGER));
    expect(() => diskRunInput({ ...largeDrop, dropped_runs: Number.MAX_SAFE_INTEGER + 1 })).toThrow();
    expect((await post(input, "tw_a_invalid")).status).toBe(401);
    const oversized = { ...input, run_id: randomUUID(), run_sequence: 2,
      padding: "x".repeat(1024 * 1024) };
    expect((await post(oversized)).status).toBe(413);
  });

  it("B03 concurrent retry converges; transaction failure leaves no metadata or mounts", async () => {
    const input = run({ seq: 3 });
    const [a, b] = await Promise.all([post(input), post(input)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([(await body(a)).duplicate, (await body(b)).duplicate].sort()).toEqual([false, true]);
    await sql`CREATE OR REPLACE FUNCTION tinywarden.test_disk_mount_failure() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic mount failure'; END $$`.execute(db);
    await sql`CREATE TRIGGER test_disk_mount_failure BEFORE INSERT ON tinywarden.disk_run_mounts
      FOR EACH ROW EXECUTE FUNCTION tinywarden.test_disk_mount_failure()`.execute(db);
    const failed = run({ seq: 4 });
    try {
      expect((await post(failed)).status).toBe(503);
      expect(await db.selectFrom("disk_runs").select("id").where("id", "=", failed.run_id)
        .executeTakeFirst()).toBeUndefined();
    } finally {
      await sql`DROP TRIGGER test_disk_mount_failure ON tinywarden.disk_run_mounts`.execute(db);
      await sql`DROP FUNCTION tinywarden.test_disk_mount_failure()`.execute(db);
    }
  });

  it("B04 newest failed sequence wins; incomplete and contact loss stay unknown", async () => {
    await contact(now);
    const good = run({ seq: 5, mounts: [mount("100", "5", "5")] });
    expect((await post(good)).status).toBe(200);
    expect((await health()).state).toBe("critical");
    const failed = run({ seq: 7, coverage: "incomplete", reason: "collector_timeout", mounts: [] });
    expect((await post(failed)).status).toBe(200);
    expect((await post(run({ seq: 6, mounts: [mount("100", "90", "90")] }))).status).toBe(200);
    const current = await health();
    expect(current.state).toBe("unknown");
    expect(current.reason).toBe("collector_timeout");
    expect(current.latest?.sequence).toBe(7);
    now = new Date(baseTime + 240000);
    expect((await health()).reason).toBe("contact_unavailable");
    now = new Date(baseTime + 241000);
    await contact(now);
  });

  it("B04 freshness equality, clock uncertainty and old snapshot after default edit", async () => {
    const fresh = run({ seq: 8, mounts: [mount("100", "90", "90")] });
    expect((await post(fresh)).status).toBe(200);
    await contact(now);
    expect((await health()).state).toBe("healthy");
    now = new Date(new Date(fresh.finished_at).getTime() + 3 * interval * 1000);
    await contact(now);
    expect((await health()).state).toBe("stale");
    now = new Date(now.getTime() + 1000);
    await contact(now);
    const future = run({ seq: 9, finished: new Date(now.getTime() + 31_000).toISOString(), mounts: [],
      coverage: "incomplete", reason: "collector_failed" });
    expect((await post(future)).status).toBe(200);
    expect((await health()).reason).toBe("agent_clock_uncertain");
    const def = await body(await operatorDiskDefinition(req("/api/v1/operator/check-definitions/disk-local",
      undefined, undefined, session), ctx));
    const edited = await operatorUpdateDiskDefinition(req("/api/v1/operator/check-definitions/disk-local",
      { schema_version: 1, request_id: randomUUID(), expected_revision: def.revision,
        warning_percent: initialWarning === 84 ? 83 : 84,
        critical_percent: initialCritical, interval_seconds: interval }, undefined, session), ctx);
    expect(edited.status).toBe(200);
    const obsolete = await health();
    expect(obsolete.reason).toBe("assignment_obsolete");
    expect(obsolete.history.find((item) => item.run_id === fresh.run_id)?.classification).toBe("healthy");
    const delayed = run({ seq: 10, mounts: [mount("100", "1", "1")] });
    expect((await post(delayed)).status).toBe(200);
    const afterDelay = await health();
    expect(afterDelay.reason).toBe("assignment_obsolete");
    expect(afterDelay.history.find((item) => item.run_id === delayed.run_id)?.classification)
      .toBe("critical");
  });

  it("B02 preserves historical evaluation after a host override", async () => {
    const other = await setupFixture(url!, config, () => now);
    try {
      const delivery = await body(await agentAssignments(req("/api/v1/agent/assignments",
        { schema_version: 1, agent_version: "0.0.1", capabilities: ["disk_usage.v1"],
          known_assignment: null }, other.agentCredential), other.ctx));
      const observedAt = new Date(now.getTime() + 2000);
      now = observedAt;
      const evidence = { ...run({ seq: 1, assignment: delivery.assignment_id,
        mounts: [mount("100", "10", "10")] }),
        started_at: new Date(now.getTime() - 1000).toISOString(),
        finished_at: now.toISOString() };
      expect((await agentDiskRun(req("/api/v1/agent/disk-runs", evidence,
        other.agentCredential), other.ctx)).status).toBe(200);
      const agent = await other.db.selectFrom("agents").select("id")
        .where("host_id", "=", other.hostId).executeTakeFirstOrThrow();
      await other.db.updateTable("agent_credentials").set({ last_sequence: 1,
        last_fingerprint: Buffer.alloc(32, 9), accepted_at: now, sent_at: now,
        agent_version: "0.0.1" }).where("agent_id", "=", agent.id).execute();
      const before = await readDiskHealth(other.db, other.session, other.hostId, () => now);
      expect(before.state).toBe("warning");
      const def = await body(await operatorDiskDefinition(req("/api/v1/operator/check-definitions/disk-local",
        undefined, undefined, other.session), other.ctx));
      const edit = await operatorSetHostDiskPolicy(req(
        `/api/v1/operator/hosts/${other.hostId}/checks/disk-local`,
        { schema_version: 2, request_id: randomUUID(), expected_policy_version: 0,
          expected_default_revision: def.revision, overrides: { warning_percent: 70, critical_percent: 80, interval_seconds: interval } },
        undefined, other.session), other.hostId, other.ctx);
      expect(edit.status).toBe(200);
      const after = await readDiskHealth(other.db, other.session, other.hostId, () => now);
      expect(after.reason).toBe("assignment_obsolete");
      expect(after.history.find((item) => item.run_id === evidence.run_id)?.classification).toBe("warning");
    } finally { await other.db.destroy(); }
  });

  it("B04 rejects a server clock earlier than the first receipt", async () => {
    let localNow = new Date(now.getTime() + 1000);
    const other = await setupFixture(url!, config, () => localNow);
    try {
      const delivered = await body(await agentAssignments(req("/api/v1/agent/assignments",
        { schema_version: 1, agent_version: "0.0.1", capabilities: ["disk_usage.v1"],
          known_assignment: null }, other.agentCredential), other.ctx));
      const base = localNow.getTime();
      localNow = new Date(base + 60_000);
      const evidence = { ...run({ seq: 1, assignment: delivered.assignment_id }),
        started_at: new Date(base + 1000).toISOString(),
        finished_at: new Date(base + 2000).toISOString() };
      expect((await agentDiskRun(req("/api/v1/agent/disk-runs", evidence,
        other.agentCredential), other.ctx)).status).toBe(200);
      const agent = await other.db.selectFrom("agents").select("id")
        .where("host_id", "=", other.hostId).executeTakeFirstOrThrow();
      localNow = new Date(base + 30_000);
      await other.db.updateTable("agent_credentials").set({ last_sequence: 1,
        last_fingerprint: Buffer.alloc(32, 3), accepted_at: localNow, last_contact_at:localNow, sent_at: localNow,
        agent_version: "0.0.1" }).where("agent_id", "=", agent.id).execute();
      const projection = await readDiskHealth(other.db, other.session, other.hostId, () => localNow);
      expect(projection.state).toBe("unknown");
      expect(projection.reason).toBe("server_clock_uncertain");
    } finally { await other.db.destroy(); }
  });

  it("B03 rejects old-generation credential without adding history", async () => {
    const input = run({ seq: 11 });
    await db.updateTable("agents").set({ current_generation: 2 })
      .where("host_id", "=", hostId).execute();
    expect((await post(input)).status).toBe(401);
    expect(await db.selectFrom("disk_runs").select("id").where("id", "=", input.run_id)
      .executeTakeFirst()).toBeUndefined();
  });
});
