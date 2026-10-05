import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, type Kysely } from "kysely";
import type { AppConfig } from "../../../server/config";
import type { Database } from "../../../server/db/types";
import type { HttpContext } from "../../../server/http/response";
import { createDb } from "../../../server/db/client";
import { migrate } from "../../../server/db/migrate";
import { readDiskHealth } from "../../../server/skills/results/disk-health";
import { newCredential } from "../../../server/validation";
import { agentAssignments, agentDiskRun, operatorDiskDefinition,
  operatorUpdateDiskDefinition } from "../../../server/http/handlers";
import { body, makeRequest, setupFixture } from "./fixture";

const url = process.env.TW_TEST_DATABASE_URL;
if (url && new URL(url).pathname !== "/tinywarden_test_p1b") {
  throw new Error("P2.C tests require the guarded tinywarden_test_p1b database");
}
const origin = "https://warden.example.org";
const config: AppConfig = { origin, databaseUrl: url ?? "", heartbeatIntervalSeconds: 60,
  staleAfterSeconds: 180 };
const req = makeRequest(origin);
let now = new Date("2026-10-04T12:00:00.000Z");
let db: Kysely<Database>, ctx: HttpContext, token = "", session = "", hostId = "", agentId = "";
let assignment = "";

async function resetGuardedDatabase() {
  const raw = createDb(url!);
  try {
    const identity = await sql<{ db: string; role: string; owner: string }>`
      SELECT current_database() AS db, session_user AS role,
        (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) AS owner`
      .execute(raw);
    if (identity.rows[0]?.db !== "tinywarden_test_p1b" ||
        identity.rows[0]?.role !== "tinywarden" || identity.rows[0]?.owner !== "tinywarden") {
      throw new Error("P2.C destructive test target mismatch");
    }
    await sql`DROP SCHEMA IF EXISTS tinywarden CASCADE`.execute(raw);
    await sql`CREATE SCHEMA tinywarden AUTHORIZATION tinywarden`.execute(raw);
  } finally { await raw.destroy(); }
  await migrate(url!, "tinywarden_test_p1b");
  // Migrations use wall time; recovery scenarios use their own deterministic clock.
  const seeded = createDb(url!);
  try {
    const beforeScenario = new Date(now.getTime() - 1000);
    await seeded.updateTable("check_definition_revisions").set({ created_at: beforeScenario }).execute();
    await seeded.updateTable("check_definitions").set({ enablement_changed_at: beforeScenario }).execute();
  } finally { await seeded.destroy(); }
}
async function assignmentRequest(known: unknown) {
  return agentAssignments(req("/api/v1/agent/assignments", { schema_version: 1,
    agent_version: "0.0.1", capabilities: ["disk_usage.v1"], known_assignment: known }, token), ctx);
}
async function contact() {
  await db.updateTable("agent_credentials").set({ last_sequence: 1,
    last_fingerprint: Buffer.alloc(32, 4), accepted_at: now, sent_at: now,
    agent_version: "0.0.1" }).where("agent_id", "=", agentId).execute();
}
function run(assignmentId: string) {
  return { schema_version: 1, run_id: randomUUID(), run_sequence: 1,
    assignment_id: assignmentId, started_at: "2026-10-04T12:00:01.000Z",
    finished_at: "2026-10-04T12:00:02.000Z", coverage: "complete", reason: "none",
    excluded_kernel: 0, excluded_remote: 0, dropped_runs: 0,
    mounts: [{ mount_id: 1, mount_path: "/", mount_root: "/", filesystem_type: "ext4",
      kind: "local", writable: true, shared_capacity: false, reason: "none",
      total_bytes: "100", free_bytes: "90", available_bytes: "90" }] };
}

describe.skipIf(!url)("P2.C recovery paths on guarded synthetic database", () => {
  beforeAll(async () => {
    await resetGuardedDatabase();
    ({ db, ctx, session, agentCredential: token, hostId, agentId } =
      await setupFixture(url!, config, () => now));
    const delivered = await body(await assignmentRequest(null));
    assignment = delivered.assignment_id;
  });
  afterAll(async () => {
    if (db) await db.destroy();
    await resetGuardedDatabase();
  });

  it("C02 delayed first receipt and duplicate cannot make old evidence fresh", async () => {
    now = new Date("2026-10-04T12:16:00.000Z");
    await contact();
    const old = run(assignment);
    const first = await agentDiskRun(req("/api/v1/agent/disk-runs", old, token), ctx);
    expect(first.status).toBe(200);
    const receipt = await body(first);
    const health = await readDiskHealth(db, session, hostId, () => now);
    expect(health.state).toBe("stale");
    expect(health.reason).toBe("observation_stale");
    now = new Date("2026-10-04T12:17:00.000Z");
    await contact();
    const replay = await body(await agentDiskRun(req("/api/v1/agent/disk-runs", old, token), ctx));
    expect(replay.duplicate).toBe(true);
    expect(replay.received_at).toBe(receipt.received_at);
    const after = await readDiskHealth(db, session, hostId, () => now);
    expect(after.state).toBe("stale");
    expect(after.latest?.received_at).toBe(receipt.received_at);
  });

  it("C02 rollback regression latches authority without publishing a candidate", async () => {
    const before = await db.selectFrom("check_assignment_snapshots").select("id")
      .where("host_id", "=", hostId).execute();
    const previous = await db.selectFrom("disk_runs").select("id").execute();
    const regressed = await assignmentRequest({ id: randomUUID(), revision: 2,
      digest: "0".repeat(64) });
    expect(regressed.status).toBe(409);
    expect((await body(regressed)).error.code).toBe("assignment_revision_regressed");
    expect(await db.selectFrom("check_assignment_snapshots").select("id")
      .where("host_id", "=", hostId).execute()).toEqual(before);
    const latch = await db.selectFrom("disk_recovery_latches").selectAll()
      .where("agent_id", "=", agentId).where("generation", "=", "1")
      .executeTakeFirstOrThrow();
    expect(latch.reason).toBe("assignment_revision_regressed");
    expect((await readDiskHealth(db, session, hostId, () => now)).reason)
      .toBe("assignment_recovery_required");
    await contact();
    const def = await body(await operatorDiskDefinition(req(
      "/api/v1/operator/check-definitions/disk-local", undefined, undefined, session), ctx));
    const edit = await operatorUpdateDiskDefinition(req(
      "/api/v1/operator/check-definitions/disk-local",
      { schema_version: 1, request_id: randomUUID(), expected_revision: def.revision,
        warning_percent: 84, critical_percent: 95, interval_seconds: 300 },
      undefined, session), ctx);
    expect(edit.status).toBe(200);
    expect((await readDiskHealth(db, session, hostId, () => now)).reason)
      .toBe("assignment_recovery_required");
    expect((await assignmentRequest(null)).status).toBe(409);
    expect(await db.selectFrom("disk_runs").select("id").execute()).toEqual(previous);
  });

  it("C02 rollback regression blocks current health from the restored old source", async () => {
    now = new Date("2026-10-04T12:18:00.000Z");
    const other = await setupFixture(url!, config, () => now);
    try {
      const delivered = await body(await agentAssignments(req("/api/v1/agent/assignments",
        { schema_version: 1, agent_version: "0.0.1", capabilities: ["disk_usage.v1"],
          known_assignment: null }, other.agentCredential), other.ctx));
      now = new Date("2026-10-04T12:19:00.000Z");
      await other.db.updateTable("agent_credentials").set({ last_sequence: 1,
        last_fingerprint: Buffer.alloc(32, 5), accepted_at: now, sent_at: now,
        agent_version: "0.0.1" }).where("agent_id", "=", other.agentId).execute();
      const observed = { ...run(delivered.assignment_id),
        started_at: "2026-10-04T12:18:01.000Z",
        finished_at: "2026-10-04T12:18:02.000Z" };
      expect((await agentDiskRun(req("/api/v1/agent/disk-runs", observed,
        other.agentCredential), other.ctx)).status).toBe(200);
      expect((await readDiskHealth(other.db, other.session, other.hostId, () => now)).state)
        .toBe("healthy");
      const regressed = await agentAssignments(req("/api/v1/agent/assignments",
        { schema_version: 1, agent_version: "0.0.1", capabilities: ["disk_usage.v1"],
          known_assignment: { id: randomUUID(), revision: 2, digest: "0".repeat(64) } },
        other.agentCredential), other.ctx);
      expect(regressed.status).toBe(409);
      expect((await readDiskHealth(other.db, other.session, other.hostId, () => now)).state)
        .toBe("unknown");
    } finally { await other.db.destroy(); }
  });

  it("C02 equal-revision divergence latches before a changed-source candidate", async () => {
    now = new Date("2026-10-04T12:20:00.000Z");
    const other = await setupFixture(url!, config, () => now);
    try {
      const delivered = await body(await agentAssignments(req("/api/v1/agent/assignments",
        { schema_version: 1, agent_version: "0.0.1", capabilities: ["disk_usage.v1"],
          known_assignment: null }, other.agentCredential), other.ctx));
      await other.db.updateTable("hosts").set({ architecture: "arm64" })
        .where("id", "=", other.hostId).execute();
      const before = await other.db.selectFrom("check_assignment_snapshots").select("id")
        .where("host_id", "=", other.hostId).execute();
      const mismatch = await agentAssignments(req("/api/v1/agent/assignments",
        { schema_version: 1, agent_version: "0.0.1", capabilities: ["disk_usage.v1"],
          known_assignment: { id: delivered.assignment_id, revision: delivered.revision,
            digest: "0".repeat(64) } }, other.agentCredential), other.ctx);
      expect(mismatch.status).toBe(409);
      expect((await body(mismatch)).error.code).toBe("assignment_recovery_required");
      expect(await other.db.selectFrom("check_assignment_snapshots").select("id")
        .where("host_id", "=", other.hostId).execute()).toEqual(before);
      expect((await other.db.selectFrom("disk_recovery_latches").select("reason")
        .where("agent_id", "=", other.agentId).executeTakeFirstOrThrow()).reason)
        .toBe("assignment_identity_conflict");
    } finally { await other.db.destroy(); }
  });

  it("C02 missing snapshot latches, retained history remains, replacement permits fresh evidence", async () => {
    now = new Date("2026-10-04T12:22:00.000Z");
    const other = await setupFixture(url!, config, () => now);
    try {
      const delivered = await body(await agentAssignments(req("/api/v1/agent/assignments",
        { schema_version: 1, agent_version: "0.0.1", capabilities: ["disk_usage.v1"],
          known_assignment: null }, other.agentCredential), other.ctx));
      now = new Date("2026-10-04T12:23:00.000Z");
      const missing = { ...run(randomUUID()),
        started_at: "2026-10-04T12:22:01.000Z", finished_at: "2026-10-04T12:22:02.000Z" };
      const rejected = await agentDiskRun(req("/api/v1/agent/disk-runs", missing,
        other.agentCredential), other.ctx);
      expect(rejected.status).toBe(409);
      expect((await body(rejected)).error.code).toBe("assignment_unknown");
      expect((await other.db.selectFrom("disk_recovery_latches").select("reason")
        .where("agent_id", "=", other.agentId).executeTakeFirstOrThrow()).reason)
        .toBe("assignment_snapshot_missing");
      const retained = { ...run(delivered.assignment_id), run_sequence: 2,
        started_at: "2026-10-04T12:22:03.000Z", finished_at: "2026-10-04T12:22:04.000Z" };
      expect((await agentDiskRun(req("/api/v1/agent/disk-runs", retained,
        other.agentCredential), other.ctx)).status).toBe(200);
      expect((await body(await agentDiskRun(req("/api/v1/agent/disk-runs", retained,
        other.agentCredential), other.ctx))).duplicate).toBe(true);
      const oldHealth = await readDiskHealth(other.db, other.session, other.hostId, () => now);
      expect(oldHealth.reason).toBe("assignment_recovery_required");
      expect(oldHealth.history.find((item) => item.run_id === retained.run_id)?.classification)
        .toBe("healthy");
      const replacement = newCredential("agent");
      await other.db.transaction().execute(async (trx) => {
        await trx.updateTable("agent_credentials").set({ revoked_at: now })
          .where("agent_id", "=", other.agentId).where("generation", "=", "1").execute();
        await trx.insertInto("agent_credentials").values({ id: replacement.id,
          agent_id: other.agentId, generation: 2, secret_digest: replacement.digest,
          created_at: now, revoked_at: null, last_sequence: 0, last_fingerprint: null,
          accepted_at: null, sent_at: null, agent_version: null }).execute();
        await trx.updateTable("agents").set({ current_generation: 2 })
          .where("id", "=", other.agentId).execute();
      });
      const next = await body(await agentAssignments(req("/api/v1/agent/assignments",
        { schema_version: 1, agent_version: "0.0.1", capabilities: ["disk_usage.v1"],
          known_assignment: null }, replacement.value), other.ctx));
      now = new Date("2026-10-04T12:24:00.000Z");
      await other.db.updateTable("agent_credentials").set({ last_sequence: 1,
        last_fingerprint: Buffer.alloc(32, 6), accepted_at: now, sent_at: now,
        agent_version: "0.0.1" }).where("id", "=", replacement.id).execute();
      const fresh = { ...run(next.assignment_id),
        started_at: "2026-10-04T12:23:01.000Z", finished_at: "2026-10-04T12:23:02.000Z" };
      expect((await agentDiskRun(req("/api/v1/agent/disk-runs", fresh,
        replacement.value), other.ctx)).status).toBe(200);
      expect((await readDiskHealth(other.db, other.session, other.hostId, () => now)).state)
        .toBe("healthy");
    } finally { await other.db.destroy(); }
  });
});
