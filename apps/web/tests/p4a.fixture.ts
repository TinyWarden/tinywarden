import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { createDb } from "../server/db/client";
import { assertDatabaseTarget } from "../server/db/target";
import { readDiskHealth } from "../server/checks/health";
import { agentAssignments, agentDiskRun } from "../server/http/handlers";
import { fixture, wire, sample, url } from "./p3c.fixture";
import { body } from "./p2a.fixture";
import { parseCredential } from "../server/validation";
import { retentionCutoff } from "../server/checks/retention-policy";

export { url, wire, sample };
export async function resetTestSchema() {
  const db = createDb(url!);
  try {
    await assertDatabaseTarget(db, "tinywarden_test_p1b");
    await sql`DROP SCHEMA tinywarden CASCADE`.execute(db);
    await sql`CREATE SCHEMA tinywarden AUTHORIZATION tinywarden`.execute(db);
  } finally { await db.destroy(); }
}
export async function lifecycleFixture() {
  const f = await fixture();
  const d = await body(await agentAssignments(f.req("/api/v1/agent/assignments", {
    schema_version: 1, agent_version: "0.0.1", capabilities: ["disk_usage.v1"], known_assignment: null,
  }, f.agentCredential), f.ctx));
  const baselines = (await wire(await f.fetch())).assignments;
  const disk = (sequence: number) => ({ schema_version: 1, run_id: randomUUID(), run_sequence: sequence,
    assignment_id: d.assignment_id, started_at: new Date(f.clock().getTime() - 1000).toISOString(),
    finished_at: f.clock().toISOString(), coverage: "complete", reason: "none", excluded_kernel: 0,
    excluded_remote: 0, dropped_runs: 0, mounts: [{ mount_id: 1, mount_path: "/", mount_root: "/",
      filesystem_type: "ext4", kind: "local", writable: true, shared_capacity: false,
      reason: "none", total_bytes: "100", free_bytes: "90", available_bytes: "90" }] });
  const advance = async (at: Date) => {
    f.setTime(at);
    // Keep synthetic authority fresh while testing the independent history clock.
    await f.db.updateTable("operator_sessions").set({ issued_at: new Date(at.getTime() - 1000),
      last_seen_at: at, expires_at: new Date(at.getTime() + 3600_000) })
      .where("id", "=", parseCredential("session", f.session).id).execute();
    await f.db.updateTable("agent_credentials").set({ last_sequence: 1, last_fingerprint: Buffer.alloc(32, 1),
      accepted_at: at, sent_at: at, agent_version: "0.0.1" }).where("agent_id", "=", f.agentId).execute();
  };
  return { ...f, disk, baselines, advance,
    diskPost: (r: unknown, credential = f.agentCredential) => agentDiskRun(f.req("/api/v1/agent/disk-runs", r, credential), f.ctx),
    diskHealth: () => readDiskHealth(f.db, f.session, f.hostId, f.clock),
    pruneTime: () => new Date(f.clock().getTime() + 90 * 86_400_000 + 1),
    cutoff: () => retentionCutoff(f.clock()),
  };
}
