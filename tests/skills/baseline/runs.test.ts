import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { agentBaselineRun } from "../../../server/http/baseline-handlers";
import { parseCredential } from "../../../server/validation";
import { fixture, sample, url, wire } from "./fixture";

describe.skipIf(!url)("C01/C03 immutable baseline runs and health", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => { f = await fixture(); });
  afterEach(async () => { if (f) await f.db.destroy(); });
  const health = async (key: string) => (await wire(await f.health())).checks.find((c) => c.definition_key === key)!;

  it("keeps immutable first receipt and rejects changed identity/sequence", async () => {
    const d = (await wire(await f.fetch())).assignments[0]!;
    const r = sample("package-updates", d, f.clock(), 1);
    const first = await wire(await f.run(r));
    f.setTime(new Date(f.clock().getTime() + 1000));
    const duplicate = await wire(await f.run(r));
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.received_at).toBe(first.received_at);
    expect((await f.run({ ...r, dropped_runs: 1 })).status).toBe(409);
    expect((await f.run({ ...r, run_id: randomUUID() })).status).toBe(409);
    expect((await f.run({ ...r, run_sequence: 2 })).status).toBe(409);
    expect(await f.db.selectFrom("baseline_runs").select("id").where("agent_id", "=", f.agentId).execute()).toHaveLength(1);
    expect((await f.db.selectFrom("agent_credentials").select("accepted_at").where("agent_id", "=", f.agentId).executeTakeFirst())?.accepted_at).toBeNull();
  });
  it("uses newest sequence including unknown, while retaining known attention", async () => {
    const d = (await wire(await f.fetch())).assignments[0]!;
    expect((await f.heartbeat(1)).status).toBe(200);
    expect((await f.run(sample("package-updates", d, f.clock(), 9))).status).toBe(200);
    expect((await health("package-updates")).state).toBe("warning");
    expect((await f.run(sample("package-updates", d, f.clock(), 10, true))).status).toBe(200);
    expect((await f.run(sample("package-updates", d, f.clock(), 8))).status).toBe(200);
    const h = await health("package-updates");
    expect(h.latest?.sequence).toBe(10);
    expect(h.state).toBe("unknown");
    expect(h.history.some((r) => r.assessment.state === "warning")).toBe(true);
  });
  it("requires contact and preserves original evaluator/recipe after a source change", async () => {
    const d = (await wire(await f.fetch())).assignments[0]!;
    expect((await f.run(sample("package-updates", d, f.clock(), 1))).status).toBe(200);
    await f.db.updateTable("agent_credentials").set({last_contact_at:null}).where("agent_id","=",f.agentId).execute();
    expect((await health("package-updates")).reason).toBe("contact_unavailable");
    await f.heartbeat(1);
    const before = await health("package-updates");
    expect(before.state).toBe("warning");
    const old = await wire(await f.defaults("package-updates"));
    const mode = old.package_mode === "upgrade" ? "with-new-pkgs" : "upgrade";
    const values = { interval_seconds: old.interval_seconds, timeout_seconds: old.timeout_seconds, package_mode: mode };
    expect((await f.edit("package-updates", old.revision, values)).status).toBe(200);
    expect((await health("package-updates")).reason).toBe("assignment_obsolete");
    const next = (await wire(await f.fetch())).assignments[0]!;
    expect(next.assignment_id).not.toBe(d.assignment_id);
    const after = await health("package-updates");
    expect(after.history[0]?.recipe).toEqual(before.history[0]?.recipe);
    expect(after.history[0]?.assessment).toEqual(before.history[0]?.assessment);
    const current = await wire(await f.defaults("package-updates"));
    await f.edit("package-updates", current.revision, { ...values, package_mode: old.package_mode });
  });
  it("uses observation age and never a duplicate receipt to refresh stale evidence", async () => {
    const d = (await wire(await f.fetch())).assignments[2]!;
    const r = sample("fstrim-status", d, f.clock(), 1);
    const age = 3 * d.assignment!.interval_seconds * 1000;
    r.started_at = new Date(f.clock().getTime() - age - 2000).toISOString();
    r.finished_at = new Date(f.clock().getTime() - age - 1000).toISOString();
    r.observation.fstrim.observed_at = Math.floor(new Date(r.finished_at).getTime() / 1000);
    await f.heartbeat(1);
    const received = await wire(await f.run(r));
    expect((await health("fstrim-status")).state).toBe("stale");
    f.setTime(new Date(f.clock().getTime() + 1000));
    expect((await wire(await f.run(r))).received_at).toBe(received.received_at);
    expect((await health("fstrim-status")).state).toBe("stale");
  });
  it("does not turn future agent time or backward server time into healthy status", async () => {
    const d = (await wire(await f.fetch())).assignments[2]!;
    await f.heartbeat(1);
    const r = sample("fstrim-status", d, new Date(f.clock().getTime() + 32_000), 1);
    expect((await f.run(r)).status).toBe(200);
    expect((await health("fstrim-status")).reason).toBe("agent_clock_uncertain");
    const valid = sample("fstrim-status", d, f.clock(), 2);
    expect((await f.run(valid)).status).toBe(200);
    expect((await health("fstrim-status")).state).toBe("healthy");
    f.setTime(new Date(f.clock().getTime() - 10));
    expect((await f.health()).status).toBe(401);
    await f.db.updateTable("operator_sessions").set({ last_seen_at: f.clock() })
      .where("id", "=", parseCredential("session", f.session).id).execute();
    await f.db.updateTable("agent_credentials").set({ accepted_at: f.clock(), last_contact_at:f.clock() }).where("agent_id", "=", f.agentId).execute();
    expect((await health("fstrim-status")).reason).toBe("server_clock_uncertain");
  });
  it("rejects malformed timestamps, raw evidence and escaped duplicate fields", async () => {
    const d = (await wire(await f.fetch())).assignments[1]!;
    const r = sample("reboot-required", d, f.clock(), 1);
    expect((await f.run({ ...r, started_at: "0000-01-01T00:00:00.000Z" })).status).toBe(400);
    expect((await f.run({ ...r, observation: { ...r.observation, stdout: "synthetic-private" } })).status).toBe(400);
    const body = JSON.stringify(r).replace('"schema_version":1', '"schema_version":1,"schema_\\u0076ersion":1');
    const request = new Request(f.origin + "/api/v1/agent/baseline-runs", { method: "POST", headers: {
      "Content-Type": "application/json", Authorization: `Bearer ${f.agentCredential}` }, body });
    expect((await agentBaselineRun(request, f.ctx)).status).toBe(400);
    expect(await f.db.selectFrom("baseline_runs").select("id").where("agent_id", "=", f.agentId).execute()).toHaveLength(0);
  });
});
