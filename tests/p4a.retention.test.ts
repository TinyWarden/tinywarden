import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { pruneExpiredObservations } from "../server/maintenance/retention";
import { retentionCutoff } from "../server/skills/results/retention-policy";
import { validateAudit } from "../server/access/audit";
import { lifecycleFixture, resetTestSchema, sample, url, wire } from "./p4a.fixture";

const database = "tinywarden_test_p1b";
describe.skipIf(!url)("P4.A bounded lifecycle on existing PostgreSQL", () => {
  let f: Awaited<ReturnType<typeof lifecycleFixture>>;
  beforeEach(async () => { await resetTestSchema(); f = await lifecycleFixture(); });
  afterEach(async () => { if (f) await f.db.destroy(); });
  const prune = (apply = true, elapsed?: () => number) => pruneExpiredObservations(f.db, database, apply, f.clock, elapsed);

  it("keeps the equality edge, expires one millisecond older and preserves exact receipt retries", async () => {
    const old = f.disk(9), baseline = sample("package-updates", f.baselines[0]!, f.clock(), 9);
    const diskReceipt = await wire(await f.diskPost(old)), baselineReceipt = await wire(await f.run(baseline));
    await f.advance(new Date(f.clock().getTime() + 90 * 86_400_000));
    expect((await prune()).disk_runs).toBe(0);
    await f.advance(new Date(f.clock().getTime() + 1));
    const late = f.disk(8); expect((await f.diskPost(late)).status).toBe(200);
    const lower = sample("package-updates", f.baselines[0]!, f.clock(), 8);
    expect((await f.run(lower)).status).toBe(200);
    expect((await f.diskHealth()).reason).toBe("history_expired");
    const before = (await wire(await f.health())).checks[0]!;
    expect(before.reason).toBe("history_expired"); expect(before.latest).toBeNull();
    const preview = await prune(false); expect(preview.disk_runs).toBe(1); expect(preview.baseline_runs).toBe(1);
    expect(await f.db.selectFrom("disk_run_receipts").select("id").execute()).toHaveLength(0);
    const result = await prune();
    expect(result).toMatchObject({ disk_runs: 1, baseline_runs: 1, mount_rows: 1, batches: 2, more_eligible: false, outcome: "complete" });
    expect((await f.diskHealth()).latest).toBeNull(); expect((await f.diskHealth()).reason).toBe("history_expired");
    expect((await wire(await f.health())).checks[0]!.reason).toBe("history_expired");
    expect((await f.diskHealth()).history.map((r) => r.sequence)).toEqual([8]);
    expect(await wire(await f.diskPost(old))).toMatchObject({ duplicate: true, received_at: diskReceipt.received_at });
    expect(await wire(await f.run(baseline))).toMatchObject({ duplicate: true, received_at: baselineReceipt.received_at });
    expect((await f.diskPost({ ...old, dropped_runs: 1 })).status).toBe(409);
    expect((await f.diskPost({ ...old, run_id: randomUUID() })).status).toBe(409);
    expect((await f.run({ ...baseline, run_sequence: 11 })).status).toBe(409);
    expect((await f.run({ ...sample("reboot-required", f.baselines[1]!, f.clock(), 9) })).status).toBe(409);
    const events = await f.db.selectFrom("audit_events").selectAll().where("action", "=", "observation.retention_pruned").execute();
    expect(events).toHaveLength(2); expect(events.every((e) => e.actor_kind === "system" && e.retention_days === 90)).toBe(true);
    expect((await prune()).batches).toBe(0);
    expect(await f.db.selectFrom("audit_events").select("id").where("action", "=", "observation.retention_pruned").execute()).toHaveLength(2);
    await f.db.updateTable("agent_credentials").set({ revoked_at: f.clock() }).where("agent_id", "=", f.agentId).execute();
    expect((await f.diskPost(old)).status).toBe(401);
  });

  it("serializes cleaners and retries without resurrecting expired measurements", async () => {
    const r = f.disk(1); await f.diskPost(r); await f.advance(f.pruneTime());
    const [a,b,retry] = await Promise.all([prune(), prune(), f.diskPost(r)]);
    expect(a.disk_runs + b.disk_runs).toBe(1); expect(retry.status).toBe(200);
    expect(await f.db.selectFrom("disk_runs").select("id").execute()).toHaveLength(0);
    expect(await f.db.selectFrom("disk_run_receipts").select("id").execute()).toHaveLength(1);
    expect(await f.db.selectFrom("audit_events").select("id").where("action", "=", "observation.retention_pruned").execute()).toHaveLength(1);
  });

  it("rolls back receipts, children and parents when auditing fails", async () => {
    await f.diskPost(f.disk(1)); await f.advance(f.pruneTime());
    await sql`CREATE FUNCTION tinywarden.test_retention_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='observation.retention_pruned' THEN RAISE EXCEPTION 'synthetic'; END IF; RETURN NEW; END $$`.execute(f.db);
    await sql`CREATE TRIGGER test_retention_failure BEFORE INSERT ON tinywarden.audit_events
      FOR EACH ROW EXECUTE FUNCTION tinywarden.test_retention_failure()`.execute(f.db);
    expect((await prune()).outcome).toBe("failed");
    expect(await f.db.selectFrom("disk_runs").select("id").execute()).toHaveLength(1);
    expect(await f.db.selectFrom("disk_run_mounts").select("run_id").execute()).toHaveLength(1);
    expect(await f.db.selectFrom("disk_run_receipts").select("id").execute()).toHaveLength(0);
  });

  it("reports committed disk progress when a later baseline batch fails", async () => {
    await f.diskPost(f.disk(1)); await f.run(sample("package-updates",f.baselines[0]!,f.clock(),1));
    await f.advance(f.pruneTime());
    await sql`CREATE FUNCTION tinywarden.test_retention_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.retention_family='baseline' THEN RAISE EXCEPTION 'synthetic'; END IF; RETURN NEW; END $$`.execute(f.db);
    await sql`CREATE TRIGGER test_retention_failure BEFORE INSERT ON tinywarden.audit_events
      FOR EACH ROW EXECUTE FUNCTION tinywarden.test_retention_failure()`.execute(f.db);
    expect(await prune()).toMatchObject({outcome:"failed",batches:1,disk_runs:1,baseline_runs:0});
    expect(await f.db.selectFrom("disk_run_receipts").select("id").execute()).toHaveLength(1);
    expect(await f.db.selectFrom("baseline_runs").select("id").execute()).toHaveLength(1);
    expect(await f.db.selectFrom("baseline_run_receipts").select("id").execute()).toHaveLength(0);
  });

  it("rejects ambiguous target, conflicting receipt and invalid audit fields", async () => {
    await expect(pruneExpiredObservations(f.db, "tinywarden", true, f.clock)).rejects.toThrow("wrong_database_owner");
    const r = f.disk(1); await f.diskPost(r); await f.advance(f.pruneTime());
    const row = await f.db.selectFrom("disk_runs").select(["id","host_id","agent_id","generation","run_sequence","assignment_id","received_at","request_digest"]).executeTakeFirstOrThrow();
    await f.db.insertInto("disk_run_receipts").values(row).execute();
    expect((await prune()).outcome).toBe("failed");
    expect(await f.db.selectFrom("disk_run_mounts").select("run_id").execute()).toHaveLength(1);
    expect(() => validateAudit({ action: "observation.retention_pruned", actorKind: "system", at: f.clock(),
      correlationId: randomUUID(), retentionFamily: "baseline", retentionCutoff: f.cutoff(), retentionDays: 90,
      retentionParentCount: 1, retentionMountCount: 1 })).toThrow("invalid_audit_event");
  });

  it("defaults the CLI to dry-run and rejects a mismatched production target", async () => {
    await f.diskPost(f.disk(1)); await f.advance(f.pruneTime());
    const cli = (...args: string[]) => spawnSync(process.execPath,["--import","tsx","scripts/retention.ts",...args],
      {env:{...process.env,DATABASE_URL:url},encoding:"utf8",timeout:10_000});
    const preview=cli("--expected-database",database);
    expect(preview.status).toBe(0); expect(JSON.parse(preview.stdout).mode).toBe("dry_run");
    expect(cli("--expected-database","tinywarden","--apply").status).toBe(1);
    expect(cli("--apply").status).toBe(1);
    expect(await f.db.selectFrom("disk_runs").select("id").execute()).toHaveLength(1);
    expect(await f.db.selectFrom("disk_run_receipts").select("id").execute()).toHaveLength(0);
  });

  it("caps each batch at 100 and the invocation at ten while serving both families", async () => {
    const r = f.disk(1); await f.diskPost(r);
    await f.run(sample("package-updates", f.baselines[0]!, f.clock(), 1));
    const template = await f.db.selectFrom("disk_runs").selectAll().executeTakeFirstOrThrow();
    await f.db.insertInto("disk_runs").values(Array.from({length: 1100},(_,i) => ({...template,
      id:randomUUID(),run_sequence:i+2}))).execute();
    await f.advance(f.pruneTime());
    const result = await prune();
    expect(result).toMatchObject({disk_runs:900,baseline_runs:1,batches:10,outcome:"bounded",more_eligible:true});
    const audits=await f.db.selectFrom("audit_events").select(["retention_parent_count"])
      .where("action","=","observation.retention_pruned").execute();
    expect(audits).toHaveLength(10); expect(audits.every((r) => r.retention_parent_count! <= 100)).toBe(true);
    expect((await prune()).disk_runs).toBe(201);
  });

  it("ends on lock timeout without partial work and permits a later explicit rerun", async () => {
    await f.diskPost(f.disk(1)); await f.advance(f.pruneTime());
    let release!: () => void, ready!: () => void;
    const waiting = new Promise<void>((resolve) => {ready=resolve;});
    const held = f.db.transaction().execute(async (trx) => {
      await trx.selectFrom("check_definitions").selectAll().where("definition_key","=","disk-local").forUpdate().execute();
      ready(); await new Promise<void>((resolve) => {release=resolve;});
    });
    await waiting;
    try { expect(await prune()).toMatchObject({outcome:"retryable",batches:0,disk_runs:0}); }
    finally { release(); await held; }
    expect((await prune()).disk_runs).toBe(1);
  });

  it("stops at elapsed budget without touching observations and bounds dry-run", async () => {
    await f.diskPost(f.disk(1)); await f.advance(f.pruneTime());
    let call = 0; const result = await prune(true, () => call++ === 0 ? 0 : 30_000);
    expect(result).toMatchObject({ batches: 0, disk_runs: 0, outcome: "bounded", more_eligible: true });
    expect(await f.db.selectFrom("disk_run_receipts").select("id").execute()).toHaveLength(0);
  });
});

describe("P4.A deterministic retention duration", () => {
  it.each(["2026-03-29T00:30:00.000Z", "2026-10-25T00:30:00.000Z", "2028-03-01T00:00:00.000Z"])("uses elapsed UTC days at %s", (instant) => {
    const at = new Date(instant); expect(at.getTime() - retentionCutoff(at).getTime()).toBe(90 * 86_400_000);
  });
});
