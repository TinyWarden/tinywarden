import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { randomUUID } from "node:crypto";
import { notificationFixture, url, database, captureEnv } from "./p4b.fixture";
import { notificationSettings } from "../server/notifications/config";
import { configureNotifications, acknowledgeUncertainty, notificationStatus } from "../server/notifications/control";
import { runNotifications } from "../server/notifications/run";
import { createCaptureTransport } from "../server/notifications/transport";
import { withNotificationLock } from "../server/notifications/lock";
import { claimEvent } from "../server/notifications/dispatch";
import type { Transport } from "../server/notifications/types";

describe.skipIf(!url)("P4.B transitions and outbox", () => {
  let f: Awaited<ReturnType<typeof notificationFixture>>;
  beforeEach(async () => { f = await notificationFixture(); });
  afterEach(async () => { await f?.db.destroy(); });
  it("captures warning, severity changes and recovery once; unchanged samples have no reminder", async () => {
    await f.diskState(1); expect(await f.tick()).toMatchObject({ attempts: 1 });
    await f.advanceSeconds(60); await f.tick(); expect(f.captured).toHaveLength(1);
    await f.advanceSeconds(60); await f.diskState(2, 95); await f.tick();
    await f.advanceSeconds(60); await f.diskState(3, 85); await f.tick();
    await f.advanceSeconds(60); await f.diskState(4, 10); await f.tick();
    expect((await f.events()).map((e) => [e.to_state, e.state])).toEqual([
      ["warning", "captured"], ["critical", "captured"], ["warning", "captured"], ["healthy", "captured"]]);
    expect(f.captured).toHaveLength(4);
    expect(f.captured[0]!.toString()).toContain("Local filesystem capacity");
    expect(f.captured[0]!.toString()).not.toContain("mount_path");
  });
  it("does not send a queued problem which recovered before the claim", async () => {
    await f.diskState(1); await f.enqueue(); await f.diskState(2, 10);
    await f.tick(); expect(f.captured).toHaveLength(0);
    expect(await f.events()).toMatchObject([{ state: "cancelled", outcome: "state_superseded" }]);
  });
  it("notifies offline contact separately and does not recover an unavailable check", async () => {
    await f.diskState(1); await f.tick();
    f.setTime(new Date(f.clock().getTime() + 180_000)); await f.tick();
    expect((await f.events()).map((e) => e.to_state)).toEqual(["warning", "offline"]);
    await f.advanceSeconds(60); await f.tick();
    expect((await f.events()).map((e) => e.to_state)).toEqual(["warning", "offline", "healthy"]);
    expect(f.captured).toHaveLength(3);
  });
  it("retires old route work, isolates capture settings and requires explicit configuration adoption", async () => {
    await f.diskState(1); await f.enqueue();
    const changed = notificationSettings({ ...captureEnv, NOTIFICATIONS_TO: "different@example.test" });
    expect(await runNotifications(f.db, database, changed, createCaptureTransport(changed), f.clock)).toMatchObject({ outcome: "paused_or_cooldown" });
    expect((await notificationStatus(f.db, database)).route?.paused).toBe(true);
    await configureNotifications(f.db, database, changed, false, f.clock);
    const captures: Buffer[] = [];
    await runNotifications(f.db, database, changed, createCaptureTransport(changed, captures), f.clock);
    expect(await f.events()).toEqual(expect.arrayContaining([expect.objectContaining({ state: "cancelled", outcome: "route_retired" }), expect.objectContaining({ state: "captured" })]));
    expect(captures).toHaveLength(1);
    await expect(runNotifications(f.db, database, changed, { mode: "smtp", send: async () => ({ kind: "accepted", code: "relay_accepted" }) }, f.clock)).rejects.toThrow("transport_mismatch");
  });
  it("cancels obsolete source scope without sending recovery from it", async () => {
    await f.diskState(1); await f.tick();
    const old = await f.db.selectFrom("notification_cursors").selectAll().where("subject_key", "=", "disk-local").executeTakeFirstOrThrow();
    await withNotificationLock(f.db, database, (connection) => connection.transaction().execute(async (trx) => {
      const { sampleTransition } = await import("../server/notifications/transitions");
      const route = await trx.selectFrom("notification_routes").selectAll().where("id", "=", f.routeId).executeTakeFirstOrThrow();
      await sampleTransition(trx, route, f.settings, { host_id: f.hostId, agent_id: f.agentId, generation: "1", key: "disk-local",
        source_revision: "2", policy_version: "0", eligible: true, state: "healthy", reason: "none",
        as_of: f.clock().toISOString(), valid_until: null, current_assignment_id: null });
    }));
    expect(await f.events()).toHaveLength(1);
    expect((await f.db.selectFrom("notification_cursors").select("current").where("id", "=", old.id).executeTakeFirstOrThrow()).current).toBe(false);
  });
  it("rolls back cursor/event changes when the required queue audit cannot commit", async () => {
    await f.diskState(1);
    await sql`CREATE FUNCTION tinywarden.fail_notification_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='notification.queued' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`.execute(f.db);
    await sql`CREATE TRIGGER synthetic_notification_audit BEFORE INSERT ON tinywarden.audit_events
      FOR EACH ROW EXECUTE FUNCTION tinywarden.fail_notification_audit()`.execute(f.db);
    await expect(f.enqueue()).rejects.toThrow();
    expect(await f.events()).toHaveLength(0);
    expect(await f.db.selectFrom("notification_cursors").select("id").execute()).toHaveLength(0);
  });
  it("serializes jobs; an abandoned claim becomes uncertain and acknowledgement never resends", async () => {
    await f.diskState(1); await f.enqueue();
    let release!: () => void, entered!: () => void;
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const held = withNotificationLock(f.db, database, async () => { entered(); await blocked; });
    await ready; expect(await f.tick()).toEqual({ outcome: "busy" }); release(); await held;
    const event = (await f.events())[0]!;
    await withNotificationLock(f.db, database, async (connection) => { await claimEvent(connection, event, f.settings, f.clock); });
    await f.tick(); expect(f.captured).toHaveLength(0);
    expect(await f.events()).toMatchObject([{ state: "uncertain", outcome: "abandoned_claim" }]);
    await acknowledgeUncertainty(f.db, database, event.id, f.clock); await acknowledgeUncertainty(f.db, database, event.id, f.clock);
    expect(await f.db.selectFrom("audit_events").select("id").where("action", "=", "notification.acknowledged").execute()).toHaveLength(1);
    await f.advanceSeconds(60); await f.tick(); expect(f.captured).toHaveLength(0);
    await f.diskState(2, 10); await f.advanceSeconds(60); await f.tick();
    expect(await f.events()).toMatchObject([{ state: "uncertain" }, { to_state: "healthy", state: "captured" }]);
  });
  it("does not repeat a possibly accepted send after its finish transaction fails", async () => {
    await f.diskState(1);
    await sql`CREATE FUNCTION tinywarden.fail_notification_finish() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='notification.attempt_finished' THEN RAISE EXCEPTION 'synthetic finish failure'; END IF; RETURN NEW; END $$`.execute(f.db);
    await sql`CREATE TRIGGER synthetic_notification_finish BEFORE INSERT ON tinywarden.audit_events
      FOR EACH ROW EXECUTE FUNCTION tinywarden.fail_notification_finish()`.execute(f.db);
    await expect(f.tick()).rejects.toThrow(); expect(f.captured).toHaveLength(1);
    await sql`DROP TRIGGER synthetic_notification_finish ON tinywarden.audit_events`.execute(f.db);
    await f.advanceSeconds(60); await f.tick();
    expect(f.captured).toHaveLength(1); expect(await f.events()).toMatchObject([{ state: "uncertain" }]);
  });
  it("rotates restored queue identity and never drains its saved event", async () => {
    await f.diskState(1); await f.enqueue(); const savedId = (await f.events())[0]!.id;
    const result = await configureNotifications(f.db, database, f.settings, true, f.clock);
    expect(result).toMatchObject({ changed: true }); await f.tick();
    expect(await f.events()).toEqual(expect.arrayContaining([expect.objectContaining({ id: savedId, state: "cancelled" }), expect.objectContaining({ state: "captured" })]));
    expect(f.captured).toHaveLength(1); expect(f.captured[0]!.toString()).not.toContain(savedId);
  });
  it("rotates fairly through a bounded fleet without resetting scan progress", async () => {
    await f.db.insertInto("hosts").values(Array.from({ length: 51 }, () => ({ id: randomUUID(), label: "Synthetic bounded fleet",
      reported_hostname: "fleet.example.test", os_id: "debian", os_version: "13", architecture: "amd64", enrolled_agent_version: "0.0.1", created_at: f.clock() }))).execute();
    expect(await f.tick()).toMatchObject({ sampled: 50 });
    await f.advanceSeconds(60); expect(await f.tick()).toMatchObject({ sampled: 2 });
    await f.advanceSeconds(60); expect(await f.tick()).toMatchObject({ sampled: 50 });
  });
  it("cancels transport on loss of the exact lock-owning database session", async () => {
    await f.diskState(1); let aborted = false;
    const transport: Transport = { mode: "capture", async send(_mail, signal) {
      const cancellation = new Promise<void>((resolve) => signal.addEventListener("abort", () => { aborted = true; resolve(); }, { once: true }));
      const { rows } = await sql<{ pid: number }>`SELECT pid FROM pg_locks WHERE locktype='advisory' AND classid=1415007823 AND objid=4`.execute(f.db);
      await sql`SELECT pg_terminate_backend(${rows[0]!.pid})`.execute(f.db);
      await cancellation; return { kind: "uncertain", code: "submission_unknown" };
    } };
    await expect(f.tick(transport)).rejects.toThrow(); expect(aborted).toBe(true);
    await f.advanceSeconds(60); await f.tick(); expect(f.captured).toHaveLength(0);
    expect(await f.events()).toMatchObject([{ state: "uncertain" }]);
  });
});
