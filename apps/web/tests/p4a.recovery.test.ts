import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { migrate } from "../server/db/migrate";
import { login } from "../server/access/operator";
import { heartbeat } from "../server/fleet/heartbeat";
import { newCredential } from "../server/validation";
import { acceptDiskRun, diskRunInput } from "../server/checks/runs";
import { acceptBaselineRun, baselineRunInput } from "../server/checks/baseline-runs";
import { fetchCheckAssignments } from "../server/checks/assignments";
import { fetchBaselineAssignments } from "../server/checks/baseline-assignments";
import { pruneExpiredObservations } from "../server/checks/retention";
import { lifecycleFixture, resetTestSchema, sample, url } from "./p4a.fixture";
import { databaseSnapshot, withRestoredFixture } from "./p4a.restore";

describe.skipIf(!url)("P4.A populated migration and receipt-aware restore", () => {
  let f: Awaited<ReturnType<typeof lifecycleFixture>>;
  beforeEach(async () => { await resetTestSchema(); f = await lifecycleFixture(); });
  afterEach(async () => { if (f) await f.db.destroy(); });

  it("preserves populated 007-compatible evidence when installing the additive migration", async () => {
    const disk = f.disk(1), baseline = sample("package-updates",f.baselines[0]!,f.clock(),1);
    await f.diskPost(disk); await f.run(baseline);
    const originalDisk = await f.db.selectFrom("disk_runs").selectAll().execute();
    const originalBaseline = await f.db.selectFrom("baseline_runs").selectAll().execute();
    const originalAudit = await f.db.selectFrom("audit_events").selectAll().orderBy("id").execute();
    // Remove only empty additive structures to establish the synthetic 007 shape.
    await f.db.transaction().execute(async (trx) => {
      await sql`ALTER TABLE tinywarden.audit_events DROP CONSTRAINT audit_notification_shape,
        DROP CONSTRAINT audit_notification_scope, DROP COLUMN notification_route,
        DROP COLUMN notification_event, DROP COLUMN notification_attempt, DROP COLUMN notification_outcome`.execute(trx);
      await sql`DROP TABLE tinywarden.notification_outbox,tinywarden.notification_cursors,tinywarden.notification_routes`.execute(trx);
      await sql`DELETE FROM tinywarden.kysely_migration WHERE name='009_notifications'`.execute(trx);
      await sql`DROP TABLE tinywarden.disk_run_receipts,tinywarden.baseline_run_receipts`.execute(trx);
      await sql`DROP INDEX tinywarden.disk_runs_expiry,tinywarden.baseline_runs_expiry`.execute(trx);
      await sql`ALTER TABLE tinywarden.audit_events DROP CONSTRAINT audit_retention_shape,
        DROP COLUMN retention_family,DROP COLUMN retention_cutoff,DROP COLUMN retention_days,
        DROP COLUMN retention_parent_count,DROP COLUMN retention_mount_count`.execute(trx);
      await sql`DELETE FROM tinywarden.kysely_migration WHERE name='008_observation_retention'`.execute(trx);
    });
    await migrate(url!,"tinywarden_test_p1b"); await migrate(url!,"tinywarden_test_p1b");
    expect(await f.db.selectFrom("disk_runs").selectAll().execute()).toEqual(originalDisk);
    expect(await f.db.selectFrom("baseline_runs").selectAll().execute()).toEqual(originalBaseline);
    expect(await f.db.selectFrom("audit_events").selectAll().orderBy("id").execute()).toEqual(originalAudit);
    expect(await f.db.selectFrom("disk_run_receipts").select("id").execute()).toHaveLength(0);
  });

  it("restores details, retry receipts, credentials and recovery latches on one disposable existing-instance target", async () => {
    const disk = f.disk(9), baseline = sample("package-updates",f.baselines[0]!,f.clock(),9);
    await f.diskPost(disk); await f.run(baseline);
    await f.advance(f.pruneTime());
    await f.diskPost(f.disk(8)); await f.run(sample("reboot-required",f.baselines[1]!,f.clock(),8));
    expect((await pruneExpiredObservations(f.db,"tinywarden_test_p1b",true,f.clock)).outcome).toBe("complete");
    const old = newCredential("agent"), replacement = newCredential("agent");
    const secondary = await lifecycleFixture();
    try {
      // Synthetic older and replacement authority must both survive the backup.
      await secondary.db.updateTable("agent_credentials").set({id:old.id,secret_digest:old.digest,revoked_at:f.clock()})
        .where("agent_id","=",secondary.agentId).execute();
      await secondary.db.updateTable("agents").set({current_generation:2}).where("id","=",secondary.agentId).execute();
      await secondary.db.insertInto("agent_credentials").values({id:replacement.id,agent_id:secondary.agentId,
        generation:2,secret_digest:replacement.digest,created_at:f.clock(),revoked_at:null,
        last_sequence:0,last_fingerprint:null,accepted_at:null,sent_at:null,agent_version:null}).execute();
      for (const table of ["disk_recovery_latches","baseline_recovery_latches"] as const) {
        await secondary.db.insertInto(table).values({host_id:secondary.hostId,agent_id:secondary.agentId,
          generation:2,reason:"assignment_snapshot_missing",latched_at:f.clock()}).execute();
      }
    } finally { await secondary.db.destroy(); }
    const counts = await databaseSnapshot(f.db);
    const ledger = (await sql<{name:string}>`SELECT name FROM tinywarden.kysely_migration ORDER BY name`.execute(f.db)).rows;
    await withRestoredFixture(url!,async (restored) => {
      expect(await databaseSnapshot(restored)).toEqual(counts);
      expect((await sql<{name:string}>`SELECT name FROM tinywarden.kysely_migration ORDER BY name`.execute(restored)).rows).toEqual(ledger);
      for (const table of ["disk_recovery_latches","baseline_recovery_latches"] as const) {
        expect(await restored.selectFrom(table).select(["agent_id","generation","reason"]).execute())
          .toEqual([{agent_id:secondary.agentId,generation:"2",reason:"assignment_snapshot_missing"}]);
      }
      const acl = (await sql<{db:boolean;schema:boolean;tables:boolean}>`SELECT
        has_database_privilege('public',current_database(),'CONNECT') AS db,
        has_schema_privilege('public','tinywarden','USAGE') AS schema,
        EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='tinywarden' AND
          has_table_privilege('public',format('%I.%I',schemaname,tablename),'SELECT,INSERT,UPDATE,DELETE')) AS tables`.execute(restored)).rows[0];
      expect(acl).toEqual({db:false,schema:false,tables:false});
      const foreignKeys = (await sql<{n:string}>`SELECT count(*)::text AS n FROM pg_constraint c
        JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='tinywarden'
        AND c.contype='f' AND NOT c.convalidated`.execute(restored)).rows[0]!.n;
      expect(foreignKeys).toBe("0");
      await expect(login(restored,"admin","synthetic-P2-password-2026",f.clock,randomUUID())).resolves.toBeDefined();
      const input={sequence:2,sentAt:f.clock(),agentVersion:"0.0.1"};
      const contact=await heartbeat(restored,f.agentCredential,input,f.clock);
      expect(contact.duplicate).toBe(false);
      expect((await heartbeat(restored,f.agentCredential,input,f.clock)).duplicate).toBe(true);
      await expect(heartbeat(restored,f.agentCredential,{...input,sequence:1},f.clock)).rejects.toMatchObject({status:409});
      await expect(heartbeat(restored,old.value,{...input,sequence:1},f.clock)).rejects.toMatchObject({status:401});
      expect((await heartbeat(restored,replacement.value,{...input,sequence:1},f.clock)).duplicate).toBe(false);
      const diskInput=diskRunInput(disk), baselineInput=baselineRunInput(baseline);
      expect((await acceptDiskRun(restored,f.agentCredential,diskInput,f.clock)).duplicate).toBe(true);
      expect((await acceptBaselineRun(restored,f.agentCredential,baselineInput,f.clock)).duplicate).toBe(true);
      await expect(acceptBaselineRun(restored,f.agentCredential,{...baselineInput,dropped_runs:1},f.clock)).rejects.toMatchObject({status:409});
      await expect(acceptDiskRun(restored,f.agentCredential,{...diskInput,assignment_id:randomUUID(),run_id:randomUUID(),run_sequence:20},f.clock))
        .rejects.toMatchObject({code:"assignment_unknown"});
      await expect(fetchCheckAssignments(restored,f.agentCredential,{agentVersion:"0.0.1",capabilities:["disk_usage.v1"],known:null},f.clock))
        .rejects.toMatchObject({code:"assignment_recovery_required"});
      await expect(fetchBaselineAssignments(restored,f.agentCredential,{agentVersion:"0.0.1",capabilities:["exec_observe.debian13.v1"],
        known:[{definition_key:"package-updates",known:{id:randomUUID(),revision:99,digest:"00".repeat(32)}}]},f.clock))
        .rejects.toMatchObject({code:"assignment_revision_regressed"});
      expect(await restored.selectFrom("baseline_recovery_latches").select("agent_id").execute()).toHaveLength(2);
    });
    const leftovers=(await sql<{n:string}>`SELECT count(*)::text AS n FROM pg_database
      WHERE datname LIKE 'tinywarden_test_p4a_restore_%'`.execute(f.db)).rows[0]!.n;
    expect(leftovers).toBe("0");
  },30000);
});
