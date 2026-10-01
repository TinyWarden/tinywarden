import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { notificationFixture, url } from "./p4b.fixture";
import { setupFixture, body } from "./p2a.fixture";
import { agentAssignments, agentDiskRun, agentHeartbeat } from "../server/http/handlers";
import { randomUUID } from "node:crypto";
import type { Transport } from "../server/notifications/types";
import { runNotifications } from "../server/notifications/run";

describe.skipIf(!url)("P4.B bounds and failure retries", () => {
  let f: Awaited<ReturnType<typeof notificationFixture>>;
  beforeEach(async () => { f = await notificationFixture(); });
  afterEach(async () => { await f?.db.destroy(); });
  it("retries only known failures at 5/30 minutes and stops after three attempts", async () => {
    let calls = 0;
    const refused: Transport = { mode: "capture", async send() { calls++; return { kind: "transient", code: "temporary_refusal" }; } };
    await f.diskState(1); await f.tick(refused);
    await f.advanceSeconds(60); await f.tick(refused); expect(calls).toBe(1);
    await f.advanceSeconds(240); await f.diskState(2); await f.tick(refused); expect(calls).toBe(2);
    await f.advanceSeconds(1800); await f.diskState(3); await f.tick(refused); expect(calls).toBe(3);
    expect(await f.events()).toMatchObject([{ state: "failed", attempts: 3 }]);
    await f.advanceSeconds(60); await f.tick(refused); expect(calls).toBe(3);
  });
  it("enforces the rolling-hour equality edge and expires work after 24 hours", async () => {
    await f.diskState(1);
    await f.db.updateTable("notification_routes").set({ attempt_starts: Array.from({ length: 30 }, () => f.clock()) }).where("id", "=", f.routeId).execute();
    expect(await f.tick()).toMatchObject({ attempts: 0 });
    await f.advanceSeconds(3600); await f.diskState(2); expect(await f.tick()).toMatchObject({ attempts: 1 });
    await f.advanceSeconds(60); await f.diskState(3, 95); await f.enqueue();
    await f.advanceSeconds(86_400); await f.tick();
    expect(await f.events()).toMatchObject([{ state: "captured" }, { state: "expired", attempts: 0 }]);
    expect(f.captured).toHaveLength(1);
  });
  it("limits one invocation to five attempts and resumes the remaining current event", async () => {
    await f.diskState(1);
    for (let n = 0; n < 5; n++) {
      const host = await setupFixture(url!, f.ctx.config, f.clock);
      try {
        const req = (path: string, value: unknown) => f.req(path, value, host.agentCredential);
        expect((await agentHeartbeat(req("/api/v1/agent/heartbeat", { schema_version: 1, sequence: 1,
          sent_at: f.clock().toISOString(), agent_version: "0.0.1" }), host.ctx)).status).toBe(200);
        const assignment = await body(await agentAssignments(req("/api/v1/agent/assignments", { schema_version: 1,
          agent_version: "0.0.1", capabilities: ["disk_usage.v1"], known_assignment: null }), host.ctx));
        const run = f.disk(1); run.run_id = randomUUID(); run.assignment_id = assignment.assignment_id;
        run.mounts[0]!.available_bytes = "10"; run.mounts[0]!.free_bytes = "10";
        expect((await agentDiskRun(req("/api/v1/agent/disk-runs", run), host.ctx)).status).toBe(200);
      } finally { await host.db.destroy(); }
    }
    expect(await f.tick()).toMatchObject({ attempts: 5 });
    await f.advanceSeconds(60); expect(await f.tick()).toMatchObject({ attempts: 1 });
    expect(f.captured).toHaveLength(6);
  });
  it("stops starting sampling at its budget and validates active database targets", async () => {
    await f.diskState(1); let elapsed = 0;
    expect(await f.tick(f.transport, () => { elapsed += 20_000; return elapsed; })).toMatchObject({ sampled: 0, attempts: 0 });
    expect(f.captured).toHaveLength(0);
    await expect(runNotifications(f.db, "wrong_target", f.settings, f.transport, f.clock)).rejects.toThrow("wrong_database");
  });
});
