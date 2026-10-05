import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import type { AppConfig } from "../../../server/config";
import { createDb } from "../../../server/db/client";
import { migrate } from "../../../server/db/migrate";
import { readDiskHealth } from "../../../server/skills/results/disk-health";
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
let now = new Date(Date.now() + 3600_000);
type Fixture = Awaited<ReturnType<typeof setupFixture>>;

async function resetGuardedDatabase() {
  const db = createDb(url!);
  try {
    const identity = await sql<{ db: string; role: string; owner: string }>`
      SELECT current_database() AS db, session_user AS role,
        (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) AS owner`
      .execute(db);
    if (identity.rows[0]?.db !== "tinywarden_test_p1b" ||
        identity.rows[0]?.role !== "tinywarden" || identity.rows[0]?.owner !== "tinywarden") {
      throw new Error("P2.C destructive test target mismatch");
    }
    await sql`DROP SCHEMA IF EXISTS tinywarden CASCADE`.execute(db);
    await sql`CREATE SCHEMA tinywarden AUTHORIZATION tinywarden`.execute(db);
  } finally { await db.destroy(); }
  await migrate(url!, "tinywarden_test_p1b");
}
function fetch(fixture: Fixture, known: unknown, token = fixture.agentCredential) {
  return agentAssignments(req("/api/v1/agent/assignments", { schema_version: 1,
    agent_version: "0.0.1", capabilities: ["disk_usage.v1"],
    known_assignment: known }, token), fixture.ctx);
}
function run(assignmentId: string) {
  return { schema_version: 1, run_id: randomUUID(), run_sequence: 1,
    assignment_id: assignmentId, started_at: new Date(now.getTime() - 2000).toISOString(),
    finished_at: new Date(now.getTime() - 1000).toISOString(), coverage: "complete", reason: "none",
    excluded_kernel: 0, excluded_remote: 0, dropped_runs: 0,
    mounts: [{ mount_id: 1, mount_path: "/", mount_root: "/", filesystem_type: "ext4",
      kind: "local", writable: true, shared_capacity: false, reason: "none",
      total_bytes: "100", free_bytes: "90", available_bytes: "90" }] };
}
async function markers(fixture: Fixture) {
  return fixture.db.selectFrom("disk_recovery_latches")
    .selectAll().where("agent_id", "=", fixture.agentId).execute();
}

describe.skipIf(!url)("P2.C recovery latch boundaries on guarded synthetic database", () => {
  beforeAll(resetGuardedDatabase);
  afterAll(resetGuardedDatabase);

  it("latches equal-revision ID and digest conflicts on separate generations", async () => {
    for (const field of ["id", "digest"] as const) {
      const fixture = await setupFixture(url!, config, () => now);
      try {
        const response = await fetch(fixture, null);
        const delivered = await body(response);
        expect(response.status, JSON.stringify(delivered)).toBe(200);
        const before = await fixture.db.selectFrom("check_assignment_snapshots")
          .select("id").where("host_id", "=", fixture.hostId).execute();
        const known = { id: delivered.assignment_id, revision: delivered.revision,
          digest: delivered.digest };
        known[field] = field === "id" ? randomUUID() : "0".repeat(64);
        const conflict = await fetch(fixture, known);
        expect(conflict.status).toBe(409);
        expect((await body(conflict)).error.code).toBe("assignment_recovery_required");
        expect(await markers(fixture)).toMatchObject([{ reason: "assignment_identity_conflict",
          generation: "1" }]);
        expect(await fixture.db.selectFrom("check_assignment_snapshots")
          .select("id").where("host_id", "=", fixture.hostId).execute()).toEqual(before);
      } finally { await fixture.db.destroy(); }
    }
  });

  it("unauthenticated and wrong-host requests cannot latch a generation", async () => {
    const first = await setupFixture(url!, config, () => now);
    const second = await setupFixture(url!, config, () => now);
    try {
      const delivered = await body(await fetch(second, null));
      expect((await fetch(first, { id: randomUUID(), revision: 2,
        digest: "0".repeat(64) }, "tw_a_invalid")).status).toBe(401);
      expect((await agentDiskRun(req("/api/v1/agent/disk-runs",
        run(delivered.assignment_id)), first.ctx)).status).toBe(401);
      expect((await agentDiskRun(req("/api/v1/agent/disk-runs",
        run(delivered.assignment_id), first.agentCredential), first.ctx)).status).toBe(409);
      expect(await markers(first)).toHaveLength(0);
      expect(await markers(second)).toHaveLength(0);
    } finally { await first.db.destroy(); await second.db.destroy(); }
  });

  it("concurrent repeated regression commits exactly one durable marker", async () => {
    const fixture = await setupFixture(url!, config, () => now);
    try {
      const response = await fetch(fixture, null);
        const delivered = await body(response);
        expect(response.status, JSON.stringify(delivered)).toBe(200);
      const known = { id: randomUUID(), revision: delivered.revision + 1,
        digest: "0".repeat(64) };
      const [first, second] = await Promise.all([fetch(fixture, known), fetch(fixture, known)]);
      expect([first.status, second.status]).toEqual([409, 409]);
      const codes = [(await body(first)).error.code, (await body(second)).error.code];
      expect(codes.sort()).toEqual(["assignment_recovery_required",
        "assignment_revision_regressed"].sort());
      expect(await markers(fixture)).toMatchObject([{ reason: "assignment_revision_regressed",
        generation: "1" }]);
    } finally { await fixture.db.destroy(); }
  });

  it("a valid retained older snapshot accepts history without a recovery marker", async () => {
    const fixture = await setupFixture(url!, config, () => now);
    try {
      const old = await body(await fetch(fixture, null));
      const definition = await body(await operatorDiskDefinition(req(
        "/api/v1/operator/check-definitions/disk-local", undefined, undefined,
        fixture.session), fixture.ctx));
      const edit = await operatorUpdateDiskDefinition(req(
        "/api/v1/operator/check-definitions/disk-local",
        { schema_version: 1, request_id: randomUUID(), expected_revision: definition.revision,
          warning_percent: 84, critical_percent: 95, interval_seconds: 300 },
        undefined, fixture.session), fixture.ctx);
      expect(edit.status).toBe(200);
      const current = await body(await fetch(fixture, { id: old.assignment_id,
        revision: old.revision, digest: old.digest }));
      expect(current.revision).toBe(old.revision + 1);
      now = new Date(now.getTime() + 4000);
      const observed = run(old.assignment_id);
      expect((await agentDiskRun(req("/api/v1/agent/disk-runs", observed,
        fixture.agentCredential), fixture.ctx)).status).toBe(200);
      expect(await markers(fixture)).toHaveLength(0);
      const health = await readDiskHealth(fixture.db, fixture.session,
        fixture.hostId, () => now);
      expect(health.history.find((item) => item.run_id === observed.run_id)?.classification)
        .toBe("healthy");
    } finally { await fixture.db.destroy(); }
  });
});
