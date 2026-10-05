import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Migrator, type Migration } from "kysely/migration";
import { Pool } from "pg";
import { migrate } from "../server/db/migrate";
import * as initial from "../server/db/migrations/001_initial";
import { parseDatabaseUrl } from "../server/config";

const url = process.env.TW_TEST_DATABASE_URL;
const database = "tinywarden_test_p1b";
if (url && new URL(parseDatabaseUrl(url, "tinywarden")).pathname !== `/${database}`) {
  throw new Error("P1.B migration tests require the owned test database");
}

async function checkTarget(db: Kysely<unknown>): Promise<void> {
  const { rows } = await sql<{ database_name: string; session_role: string;
    current_role: string; database_owner: string; schema_owner: string | null }>`
    SELECT current_database() AS database_name, session_user AS session_role,
      current_user AS current_role,
      (SELECT pg_get_userbyid(datdba) FROM pg_database
        WHERE datname = current_database()) AS database_owner,
      (SELECT pg_get_userbyid(nspowner) FROM pg_namespace
        WHERE nspname = 'tinywarden') AS schema_owner`.execute(db);
  const target = rows[0];
  if (!target || target.database_name !== database || target.session_role !== "tinywarden" ||
      target.current_role !== "tinywarden" || target.database_owner !== "tinywarden" ||
      (target.schema_owner !== null && target.schema_owner !== "tinywarden")) {
    throw new Error("P1.B migration target or owner mismatch");
  }
}

async function cliMigration(): Promise<{ status: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", "migrate", "--", database], {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      env: { ...process.env, DATABASE_URL: url }, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (part: Buffer) => { output += part.toString(); });
    child.stderr.on("data", (part: Buffer) => { output += part.toString(); });
    child.on("error", reject);
    child.on("exit", (status) => resolve({ status: status ?? -1, output }));
  });
}

describe.skipIf(!url)("P1.B migration and SQL integrity", () => {
  let raw: Kysely<unknown>;
  beforeAll(async () => {
    raw = new Kysely<unknown>({ dialect: new PostgresDialect({
      pool: new Pool({ connectionString: url!, max: 3 }),
    }) });
    await checkTarget(raw);
    await sql`DROP SCHEMA IF EXISTS tinywarden CASCADE`.execute(raw);
  });
  afterAll(async () => { if (raw) await raw.destroy(); });

  it("upgrades populated 001 audit history without changing actor provenance", async () => {
    await sql`CREATE SCHEMA tinywarden AUTHORIZATION tinywarden`.execute(raw);
    const first = new Migrator({ db: raw, migrationTableSchema: "tinywarden",
      provider: { getMigrations: async () => ({ "001_initial": initial }) } });
    const applied = await first.migrateToLatest();
    expect(applied.error).toBeUndefined();
    const hostId = randomUUID();
    const agentId = randomUUID();
    const eventId = randomUUID();
    await sql`INSERT INTO tinywarden.hosts(id,label,reported_hostname,os_id,os_version,
      architecture,enrolled_agent_version,created_at)
      VALUES (${hostId},'legacy','legacy.example.org','debian','13','amd64','0.0.1',
        '2026-09-28T12:00:00.000Z')`.execute(raw);
    await sql`INSERT INTO tinywarden.agents(id,host_id,current_generation,enrolled_at,
      heartbeat_interval_seconds,stale_after_seconds)
      VALUES (${agentId},${hostId},1,'2026-09-28T12:00:00.000Z',60,180)`.execute(raw);
    await sql`INSERT INTO tinywarden.audit_events(id,occurred_at,action,actor_kind,
      agent_id,host_id,correlation_id)
      VALUES (${eventId},'2026-09-28T12:00:00.000Z','agent.enrolled','agent',
        ${agentId},${hostId},${randomUUID()})`.execute(raw);
    const before = (await sql<{ original: Record<string, unknown> }>`
      SELECT to_jsonb(a) AS original FROM tinywarden.audit_events a
      WHERE id = ${eventId}`.execute(raw)).rows[0];
    const [left, right] = await Promise.all([cliMigration(), cliMigration()]);
    expect(left.status, left.output).toBe(0);
    expect(right.status, right.output).toBe(0);
    const after = (await sql<{ original: Record<string, unknown>; target: string | null }>`
      SELECT to_jsonb(a) - 'target_agent_id' - 'definition_key' - 'from_definition_revision'
        - 'to_definition_revision' - 'from_policy_version' - 'to_policy_version'
        - 'baseline_key' - 'from_baseline_revision' - 'to_baseline_revision'
        - 'from_baseline_policy' - 'to_baseline_policy' - 'retention_family' - 'retention_cutoff'
        - 'retention_days' - 'retention_parent_count' - 'retention_mount_count'
        - 'notification_route' - 'notification_event' - 'notification_attempt' - 'notification_outcome' AS original,
        target_agent_id::text AS target FROM tinywarden.audit_events a
      WHERE id = ${eventId}`.execute(raw)).rows[0];
    expect(after).toEqual({ original: before?.original, target: null });
    expect(before?.original.agent_id).toBe(agentId);
    expect((await sql<{ n: string }>`SELECT count(*)::text AS n
      FROM tinywarden.audit_events WHERE id = ${eventId}`.execute(raw)).rows[0]?.n).toBe("1");
    const names = (await sql<{ name: string }>`SELECT name FROM tinywarden.kysely_migration
      ORDER BY name`.execute(raw)).rows.map((row) => row.name);
    expect(names).toEqual(["001_initial", "002_audit_target_agent", "003_check_definitions",
      "004_disk_runs", "005_disk_recovery_latches", "006_baseline_definitions", "007_baseline_runs", "008_observation_retention", "009_notifications", "010_fleet_history", "011_fstrim_context", "012_skill_enablement", "013_field_overrides", "014_package_skills", "015_package_subjects"]);
    expect((await sql<{ n: string }>`SELECT count(*)::text AS n FROM tinywarden.audit_events
      WHERE action='check.definition_initialized'`.execute(raw)).rows[0]?.n).toBe("1");
    const repeat = await cliMigration();
    expect(repeat.status, repeat.output).toBe(0);
    expect((await sql<{ n: string }>`SELECT count(*)::text AS n
      FROM tinywarden.kysely_migration`.execute(raw)).rows[0]?.n).toBe("15");
    await expect(sql`INSERT INTO tinywarden.audit_events(id,occurred_at,action,actor_kind,
      agent_id,target_agent_id,host_id,correlation_id)
      VALUES (${randomUUID()},'2026-09-28T12:00:00.000Z','agent.enrolled','agent',
        ${agentId},${randomUUID()},${hostId},${randomUUID()})`.execute(raw))
      .rejects.toMatchObject({ code: "23503" });
    await expect(sql`INSERT INTO tinywarden.audit_events(id,occurred_at,action,actor_kind,
      agent_id,target_agent_id,host_id,correlation_id)
      VALUES (${randomUUID()},'2026-09-28T12:00:00.000Z','agent.revoked','operator',
        ${agentId},${agentId},${hostId},${randomUUID()})`.execute(raw))
      .rejects.toMatchObject({ code: "23514" });
    const targetIndex = (await sql<{ name: string | null }>`SELECT to_regclass(
      'tinywarden.audit_events_target_agent')::text AS name`.execute(raw)).rows[0]?.name;
    expect(targetIndex).toContain("audit_events_target_agent");
    const targetFk = (await sql<{ deletion: string }>`SELECT confdeltype AS deletion
      FROM pg_constraint WHERE conrelid = 'tinywarden.audit_events'::regclass
      AND conname = 'audit_events_target_agent_id_fkey'`.execute(raw)).rows[0];
    expect(targetFk?.deletion).toBe("r");
    const legacyAfterUpgrade = randomUUID();
    await sql`INSERT INTO tinywarden.audit_events(id,occurred_at,action,actor_kind,
      agent_id,host_id,correlation_id)
      VALUES (${legacyAfterUpgrade},'2026-09-28T12:00:00.000Z','agent.enrolled','agent',
        ${agentId},${hostId},${randomUUID()})`.execute(raw);
    expect((await sql<{ target: string | null }>`SELECT target_agent_id::text AS target
      FROM tinywarden.audit_events WHERE id = ${legacyAfterUpgrade}`.execute(raw))
      .rows[0]?.target).toBeNull();
    const targetedHost = randomUUID();
    const targetedAgent = randomUUID();
    await sql`INSERT INTO tinywarden.hosts(id,label,reported_hostname,os_id,os_version,
      architecture,enrolled_agent_version,created_at)
      VALUES (${targetedHost},'target','target.example.org','debian','13','amd64','0.0.1',
        '2026-09-28T12:00:00.000Z')`.execute(raw);
    await sql`INSERT INTO tinywarden.agents(id,host_id,current_generation,enrolled_at,
      heartbeat_interval_seconds,stale_after_seconds)
      VALUES (${targetedAgent},${targetedHost},1,'2026-09-28T12:00:00.000Z',60,180)`.execute(raw);
    await sql`INSERT INTO tinywarden.audit_events(id,occurred_at,action,actor_kind,
      target_agent_id,host_id,correlation_id)
      VALUES (${randomUUID()},'2026-09-28T12:00:00.000Z','agent.revoked','system',
        ${targetedAgent},${targetedHost},${randomUUID()})`.execute(raw);
    await expect(sql`DELETE FROM tinywarden.agents WHERE id = ${targetedAgent}`.execute(raw))
      .rejects.toMatchObject({ code: "23001" });
    const migrator = new Migrator({ db: raw, migrationTableSchema: "tinywarden",
      provider: { getMigrations: async () => ({ "001_initial": initial,
        "002_audit_target_agent": await import("../server/db/migrations/002_audit_target_agent"),
        "003_check_definitions": await import("../server/db/migrations/003_check_definitions"),
        "004_disk_runs": await import("../server/db/migrations/004_disk_runs"),
        "005_disk_recovery_latches": await import("../server/db/migrations/005_disk_recovery_latches"),
        "006_baseline_definitions": await import("../server/db/migrations/006_baseline_definitions"),
        "007_baseline_runs": await import("../server/db/migrations/007_baseline_runs"),
        "008_observation_retention": await import("../server/db/migrations/008_observation_retention"),
        "009_notifications": await import("../server/db/migrations/009_notifications"),
        "010_fleet_history": await import("../server/db/migrations/010_fleet_history"),
        "011_fstrim_context": await import("../server/db/migrations/011_fstrim_context"),
        "012_skill_enablement": await import("../server/db/migrations/012_skill_enablement"),
        "013_field_overrides": await import("../server/db/migrations/013_field_overrides"),
        "014_package_skills": await import("../server/db/migrations/014_package_skills"),
        "015_package_subjects": await import("../server/db/migrations/015_package_subjects") }) } });
    const down = await migrator.migrateDown();
    expect(down.error).toBeTruthy();
    expect((await sql<{ n: string }>`SELECT count(*)::text AS n
      FROM tinywarden.kysely_migration`.execute(raw)).rows[0]?.n).toBe("15");
  }, 30000);

  it("serializes two first-install migration processes and no-ops on rerun", async () => {
    await sql`DROP SCHEMA tinywarden CASCADE`.execute(raw);
    await sql`CREATE SCHEMA tinywarden AUTHORIZATION tinywarden`.execute(raw);
    const [first, second] = await Promise.all([cliMigration(), cliMigration()]);
    expect(first.status, first.output).toBe(0);
    expect(second.status, second.output).toBe(0);
    const count = await sql<{ n: string }>`SELECT count(*)::text AS n
      FROM tinywarden.kysely_migration`.execute(raw);
    expect(count.rows[0]?.n).toBe("15");
    expect((await sql<{ name: string }>`SELECT name FROM tinywarden.kysely_migration
      ORDER BY name`.execute(raw)).rows.map((row) => row.name))
      .toEqual(["001_initial", "002_audit_target_agent", "003_check_definitions",
        "004_disk_runs", "005_disk_recovery_latches", "006_baseline_definitions", "007_baseline_runs", "008_observation_retention", "009_notifications", "010_fleet_history", "011_fstrim_context", "012_skill_enablement", "013_field_overrides", "014_package_skills", "015_package_subjects"]);
    await migrate(url!, database);
    const rerun = await sql<{ n: string }>`SELECT count(*)::text AS n
      FROM tinywarden.kysely_migration`.execute(raw);
    expect(rerun.rows[0]?.n).toBe("15");
    const wrong = await migrate(url!, "postgres").then(() => "accepted", () => "rejected");
    expect(wrong).toBe("rejected");
  }, 30000);

  it("rolls back a failing migration's table and version entry", async () => {
    const failing: Migration = { up: async (db) => {
      await sql`CREATE TABLE tinywarden_p1b_failure.rollback_probe (id int PRIMARY KEY)`.execute(db);
      throw new Error("injected_migration_failure");
    }, down: async () => {} };
    const migrator = new Migrator({ db: raw, migrationTableSchema: "tinywarden_p1b_failure",
      provider: { getMigrations: async () => ({ "001_fails": failing }) } });
    const result = await migrator.migrateToLatest();
    expect(result.error).toBeTruthy();
    const probe = await sql<{ name: string | null }>`SELECT
      to_regclass('tinywarden_p1b_failure.rollback_probe')::text AS name`.execute(raw);
    expect(probe.rows[0]?.name).toBeNull();
    const versions = await sql<{ n: string }>`SELECT count(*)::text AS n
      FROM tinywarden_p1b_failure.kysely_migration`.execute(raw);
    expect(versions.rows[0]?.n).toBe("0");
  });

  it("enforces constraints, driver types and no PUBLIC project access", async () => {
    const hostId = randomUUID();
    await sql`INSERT INTO tinywarden.hosts(id,label,reported_hostname,os_id,os_version,
      architecture,enrolled_agent_version,created_at)
      VALUES (${hostId},'fixture','fixture.example.org','debian','13','amd64','0.0.1',
        '2026-09-28T12:00:00.000Z')`.execute(raw);
    await expect(sql`INSERT INTO tinywarden.hosts(id,label,reported_hostname,os_id,
      os_version,architecture,enrolled_agent_version,created_at)
      VALUES (${hostId},'duplicate','fixture.example.org','debian','13','amd64','0.0.1',
        '2026-09-28T12:00:00.000Z')`.execute(raw)).rejects.toMatchObject({ code: "23505" });
    await expect(sql`INSERT INTO tinywarden.hosts(id,label,reported_hostname,os_id,
      os_version,architecture,enrolled_agent_version,created_at)
      VALUES (${randomUUID()},'', 'fixture.example.org','debian','13','amd64','0.0.1',
        '2026-09-28T12:00:00.000Z')`.execute(raw)).rejects.toMatchObject({ code: "23514" });
    await expect(sql`INSERT INTO tinywarden.agents(id,host_id,current_generation,
      enrolled_at,heartbeat_interval_seconds,stale_after_seconds)
      VALUES (${randomUUID()},${randomUUID()},1,'2026-09-28T12:00:00.000Z',60,180)`
      .execute(raw)).rejects.toMatchObject({ code: "23503" });
    await sql`INSERT INTO tinywarden.agents(id,host_id,current_generation,
      enrolled_at,heartbeat_interval_seconds,stale_after_seconds)
      VALUES (${randomUUID()},${hostId},1,'2026-09-28T12:00:00.000Z',60,180)`.execute(raw);
    const driver = await sql<{ current_generation: string; enrolled_at: Date }>`
      SELECT current_generation,enrolled_at FROM tinywarden.agents WHERE host_id = ${hostId}`
      .execute(raw);
    expect(driver.rows[0]?.current_generation).toBe("1");
    expect(driver.rows[0]?.enrolled_at).toBeInstanceOf(Date);
    const privileges = await sql<{ connect: boolean; schema: boolean; audit_update: boolean }>`
      SELECT has_database_privilege('public',current_database(),'CONNECT') AS connect,
        has_schema_privilege('public','tinywarden','USAGE') AS schema,
        has_table_privilege('public','tinywarden.audit_events','UPDATE') AS audit_update`
      .execute(raw);
    expect(privileges.rows[0]).toEqual({ connect: false, schema: false, audit_update: false });
    expect((await sql<{ name: string | null }>`SELECT
      to_regclass('tinywarden.audit_events')::text AS name`.execute(raw)).rows[0]?.name)
      .not.toBeNull();
  });
});
