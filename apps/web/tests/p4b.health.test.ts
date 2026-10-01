import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { notificationFixture, url } from "./p4b.fixture";
import { diskHealthSummary } from "../server/checks/health";
import { baselineHealthSummaries } from "../server/checks/baseline-health";
import { detailHost } from "../server/fleet/inventory";
import { contactSummary } from "../server/fleet/contact";
import { pruneExpiredObservations } from "../server/checks/retention";
import { wire, sample } from "./p4a.fixture";

describe.skipIf(!url)("P4.B shared health and authority", () => {
  let f: Awaited<ReturnType<typeof notificationFixture>>;
  beforeEach(async () => { f = await notificationFixture(); });
  afterEach(async () => { await f?.db.destroy(); });
  it("shares disk/contact projections while system reads never renew operator sessions", async () => {
    const before = await f.db.selectFrom("operator_sessions").selectAll().execute();
    for (const [sequence, used, state] of [[1, 10, "healthy"], [2, 85, "warning"], [3, 95, "critical"]] as const) {
      await f.diskState(sequence, used);
      const summary = await f.db.transaction().execute((trx) => diskHealthSummary(trx, f.hostId, f.clock));
      expect(summary.state).toBe(state); expect(Object.keys(summary)).not.toContain("latest");
      expect((await f.diskHealth()).state).toBe(summary.state);
    }
    const contacted = await f.db.transaction().execute((trx) => contactSummary(trx, f.hostId, f.clock));
    expect((await detailHost(f.db, f.session, f.hostId, f.clock)).host.contact_state).toBe("current");
    expect(contacted.state).toBe("healthy");
    // Operator reads above update activity; compare a second system-only read against that baseline.
    const checkpoint = await f.db.selectFrom("operator_sessions").selectAll().execute();
    await f.db.transaction().execute((trx) => diskHealthSummary(trx, f.hostId, f.clock));
    expect(await f.db.selectFrom("operator_sessions").selectAll().execute()).toEqual(checkpoint);
    expect(before).toHaveLength(1);
    await expect((await import("../server/checks/health")).readDiskHealth(f.db, "invalid", f.hostId, f.clock)).rejects.toThrow();
    await expect((await import("../server/checks/baseline-health")).readBaselineHealth(f.db, "invalid", f.hostId, f.clock)).rejects.toThrow();
  });
  it("keeps receipt/highest-sequence expiration, baseline evaluation and clock precedence", async () => {
    await f.diskState(9); await f.run(sample("package-updates", f.baselines[0]!, f.clock(), 9));
    const compare = async () => {
      const disk = await f.db.transaction().execute((trx) => diskHealthSummary(trx, f.hostId, f.clock));
      expect(disk.state).toBe((await f.diskHealth()).state); expect(disk.reason).toBe((await f.diskHealth()).reason);
      const summaries = await f.db.transaction().execute((trx) => baselineHealthSummaries(trx, f.hostId, f.clock));
      const detail = (await wire(await f.health())).checks;
      summaries.forEach((s, i) => expect({ state: s.state, reason: s.reason }).toEqual({ state: detail[i]!.state, reason: detail[i]!.reason }));
      return { disk, summaries };
    };
    expect((await compare()).summaries[0]!.state).toBe("warning");
    await f.advance(new Date(f.clock().getTime() + 90 * 86_400_000 + 1));
    await f.diskState(8, 10); await f.run(sample("package-updates", f.baselines[0]!, f.clock(), 8));
    await pruneExpiredObservations(f.db, "tinywarden_test_p1b", true, f.clock);
    expect((await compare()).disk.reason).toBe("history_expired");
    expect((await compare()).summaries[0]!.reason).toBe("history_expired");
    f.setTime(new Date(f.clock().getTime() - 1));
    expect((await f.db.transaction().execute((trx) => diskHealthSummary(trx, f.hostId, f.clock))).state).toBe("unknown");
  });
  it("matches offline contact and treats revoked authority as ineligible", async () => {
    f.setTime(new Date(f.clock().getTime() + 180_000));
    expect((await f.db.transaction().execute((trx) => contactSummary(trx, f.hostId, f.clock))).state).toBe("offline");
    expect((await detailHost(f.db, f.session, f.hostId, f.clock)).host.contact_state).toBe("stale");
    await f.db.updateTable("agent_credentials").set({ revoked_at: f.clock() }).where("agent_id", "=", f.agentId).execute();
    const summary = await f.db.transaction().execute((trx) => diskHealthSummary(trx, f.hostId, f.clock));
    expect(summary).toMatchObject({ eligible: false, state: "unknown", reason: "contact_unavailable" });
  });
});
