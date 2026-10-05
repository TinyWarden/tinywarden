import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { baselineKeys } from "../../../server/skills/legacy/shared/types";
import { agentBaselineAssignments, operatorUpdateBaselineDefinition } from "../../../server/http/baseline-handlers";
import { fixture, known, url, wire } from "./fixture";
import { createDb } from "../../../server/db/client";

describe.skipIf(!url)("C01 additive baseline delivery and policy", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeAll(async () => {
    const db = createDb(url!);
    try {
      const { rows } = await sql<{ db: string; role: string; owner: string; schema: string | null }>`
        SELECT current_database() AS db, session_user AS role,
          (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) AS owner,
          (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='tinywarden') AS schema`.execute(db);
      const target = rows[0];
      if (target?.db !== "tinywarden_test_p1b" || target.role !== "tinywarden" || target.owner !== "tinywarden" ||
          (target.schema !== null && target.schema !== "tinywarden")) throw new Error("P3.C seed test target mismatch");
      // Seed audit assertions must inspect a fresh migration, regardless of file order.
      await sql`DROP SCHEMA IF EXISTS tinywarden CASCADE`.execute(db);
      await sql`CREATE SCHEMA tinywarden AUTHORIZATION tinywarden`.execute(db);
    } finally { await db.destroy(); }
    f = await fixture();
  });
  afterAll(async () => { if (f) await f.db.destroy(); });

  it("retains three bounded audited seeds and 001–005", async () => {
    const seeds = await f.db.selectFrom("baseline_definition_revisions").selectAll().where("revision", "=", "1").execute();
    expect(seeds.map((s) => s.definition_key).sort()).toEqual([...baselineKeys].sort());
    expect(seeds.every((s) => s.interval_seconds === 3600 && s.package_mode === "upgrade")).toBe(true);
    const audit = await f.db.selectFrom("audit_events").selectAll().where("action", "=", "baseline.definition_initialized").execute();
    expect(audit).toHaveLength(3);
    expect(audit.every((a) => a.definition_key === null && a.to_baseline_revision === "1")).toBe(true);
    expect((await sql<{ n: string }>`SELECT count(*)::text AS n FROM tinywarden.kysely_migration`.execute(f.db)).rows[0]?.n).toBe("15");
  });
  it("guards origins, operator authority, exact fields and schema bounds", async () => {
    const base = await wire(await f.defaults("package-updates"));
    const path = "/api/v1/operator/baseline-definitions/package-updates";
    const value = { schema_version: 1, request_id: randomUUID(), expected_revision: base.revision,
      interval_seconds: 3600, timeout_seconds: 30, package_mode: "upgrade" };
    expect((await operatorUpdateBaselineDefinition(f.req(path, value), "package-updates", f.ctx)).status).toBe(401);
    const wrong = new Request(f.origin + path, { method: "POST", headers: { Origin: "https://elsewhere.example.org" }, body: "{}" });
    expect((await operatorUpdateBaselineDefinition(wrong, "package-updates", f.ctx)).status).toBe(403);
    expect((await f.edit("package-updates", base.revision, { ...value, timeout_seconds: 31 })).status).toBe(400);
    await expect(sql`UPDATE tinywarden.baseline_definition_revisions SET interval_seconds=299
      WHERE definition_key='package-updates' AND revision=1`.execute(f.db)).rejects.toMatchObject({ code: "23514" });
  });
  it("delivers separate applicability and cannot renew heartbeat", async () => {
    const before = await f.db.selectFrom("agent_credentials").select(["last_sequence", "accepted_at"]).where("agent_id", "=", f.agentId).executeTakeFirst();
    const missing = await wire(await f.fetch(undefined, []));
    expect(missing.assignments).toHaveLength(3);
    expect(missing.assignments.every((a) => a.assignment?.applicability === "missing_capability")).toBe(true);
    const ready = await wire(await f.fetch());
    expect(ready.assignments.every((a) => a.assignment?.applicability === "ready" && a.assignment.recipe.capability === "exec_observe.debian13.v1")).toBe(true);
    const omitted = await wire(await f.fetch(known(ready.assignments)));
    expect(omitted.assignments.every((a) => a.not_modified && a.assignment === undefined)).toBe(true);
    expect(await f.db.selectFrom("agent_credentials").select(["last_sequence", "accepted_at"]).where("agent_id", "=", f.agentId).executeTakeFirst()).toEqual(before);
  });
  it("rejects duplicate keys/capabilities and unrecognized input", async () => {
    const value = { schema_version: 1, agent_version: "0.0.1", capabilities: ["exec_observe.debian13.v1"],
      known_assignments: baselineKeys.map((definition_key) => ({ definition_key, known: null })) };
    value.known_assignments[1] = value.known_assignments[0]!;
    expect((await agentBaselineAssignments(f.req("/api/v1/agent/baseline-assignments", value, f.agentCredential), f.ctx)).status).toBe(400);
    value.known_assignments = baselineKeys.map((definition_key) => ({ definition_key, known: null }));
    expect((await agentBaselineAssignments(f.req("/api/v1/agent/baseline-assignments", { ...value, capabilities: ["disk_usage.v1", "disk_usage.v1"] }, f.agentCredential), f.ctx)).status).toBe(400);
    expect((await agentBaselineAssignments(f.req("/api/v1/agent/baseline-assignments", { ...value, command: "test" }, f.agentCredential), f.ctx)).status).toBe(400);
  });
  it("optimistic edits are audited/idempotent and stale edits preserve source", async () => {
    const base = await wire(await f.defaults("package-updates"));
    const id = randomUUID(), values = { interval_seconds: 3600, timeout_seconds: 29, package_mode: "with-new-pkgs" };
    const saved = await wire(await f.edit("package-updates", base.revision, values, id));
    expect(saved.changed).toBe(true);
    expect((await wire(await f.edit("package-updates", base.revision, values, id))).duplicate).toBe(true);
    expect((await f.edit("package-updates", base.revision, { ...values, timeout_seconds: 28 })).status).toBe(409);
    expect((await f.edit("package-updates", base.revision, { ...values, timeout_seconds: 28 }, id)).status).toBe(409);
    const audits = await f.db.selectFrom("audit_events").selectAll().where("action", "=", "baseline.definition_updated")
      .where("baseline_key", "=", "package-updates").where("to_baseline_revision", "=", String(saved.revision)).execute();
    expect(audits).toHaveLength(1);
    expect(audits[0]?.definition_key).toBeNull();
  });
  it("pins host overrides and no-change saves retain the original pin", async () => {
    const key = "package-updates", base = await wire(await f.defaults(key)), p = await wire(await f.policy(key));
    const values = { interval_seconds: 300, timeout_seconds: 20, package_mode: "upgrade" };
    expect((await f.setPolicy(key, p.policy_version, base.revision, "override", values)).status).toBe(200);
    const pinned = await wire(await f.policy(key));
    const changed = await wire(await f.edit(key, base.revision, { interval_seconds: 7200, timeout_seconds: 30, package_mode: "upgrade" }));
    expect((await f.setPolicy(key, pinned.policy_version, changed.revision, "override", values)).status).toBe(200);
    const unchanged = await wire(await f.policy(key));
    expect(unchanged.policy_version).toBe(pinned.policy_version);
    expect(unchanged.pinned_definition_revision).toBe(base.revision);
    expect(unchanged.effective_values).toEqual(values);
    expect((await f.setPolicy(key, unchanged.policy_version, changed.revision, "inherit")).status).toBe(200);
    expect((await wire(await f.policy(key))).effective_values.interval_seconds).toBe(7200);
    expect((await f.edit(key, changed.revision, { interval_seconds: 3600, timeout_seconds: 30, package_mode: "upgrade" })).status).toBe(200);
  });
});
