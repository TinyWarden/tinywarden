import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { notificationFixture, url, database, captureEnv } from "./p4b.fixture";
import { notificationSettings, templateFingerprint } from "../server/notifications/config";
import { upgradeNotificationTemplate } from "../server/notifications/control";
import { sampleTransition } from "../server/notifications/transitions";
import { messageV2 } from "../server/notifications/message-v2";
import { pruneMessageBatch } from "../server/notifications/retention";
import { notificationMetadata } from "./skills/packages/notification-fixture";
import type { Transport } from "../server/notifications/types";

describe.skipIf(!url)("N1 frozen notifications on the existing database", () => {
  let f: Awaited<ReturnType<typeof notificationFixture>>;
  beforeEach(async () => { f = await notificationFixture(); });
  afterEach(async () => { await f?.db.destroy(); });
  it("upgrades only template identity without replay, preserves pending v1 and refuses changed recipient", async () => {
    await f.diskState(1); await f.enqueue();
    await f.db.updateTable("notification_routes").set({ fingerprint: templateFingerprint(f.settings, 1), paused: true }).where("id", "=", f.routeId).execute();
    await f.db.updateTable("notification_outbox").set({ template_version: 1, message_snapshot: null }).execute();
    const before = await f.db.selectFrom("notification_routes").selectAll().executeTakeFirstOrThrow(), cursors = await f.db.selectFrom("notification_cursors").selectAll().execute();
    expect(await upgradeNotificationTemplate(f.db, database, f.settings, f.clock)).toMatchObject({ routeId: f.routeId, changed: true });
    const after = await f.db.selectFrom("notification_routes").selectAll().executeTakeFirstOrThrow();
    expect({ ...after, fingerprint: before.fingerprint }).toEqual(before);
    expect(await f.db.selectFrom("notification_cursors").selectAll().execute()).toEqual(cursors);
    expect(await upgradeNotificationTemplate(f.db, database, f.settings, f.clock)).toMatchObject({ changed: false });
    await expect(upgradeNotificationTemplate(f.db, database, notificationSettings({ ...captureEnv, NOTIFICATIONS_TO: "changed@example.test" }), f.clock)).rejects.toThrow("configuration_mismatch");
    await f.db.updateTable("notification_routes").set({ paused: false }).execute();
    await f.tick(); expect(f.captured).toHaveLength(1); expect(f.captured[0]!.toString()).toContain("TinyWarden: a host needs attention");
    await f.advanceSeconds(60); await f.tick(); expect(f.captured).toHaveLength(1);
  });
  it("freezes same-reading Details across transient retry and clears terminal/expired prose", async () => {
    await f.diskState(1); const at = f.clock(), metadata = notificationMetadata("disk-local");
    await f.db.transaction().execute(async (trx) => {
      const route = await trx.selectFrom("notification_routes").selectAll().where("id", "=", f.routeId).executeTakeFirstOrThrow();
      await sampleTransition(trx, route, f.settings, { host_id: f.hostId, agent_id: f.agentId, generation: "1", key: "disk-local",
        source_revision: "1", policy_version: "0", eligible: true, state: "warning", reason: "skill_assessment", as_of: at.toISOString(),
        valid_until: null, current_assignment_id: null, name: "Disk space", metadata, settings: metadata.manifest.defaults,
        measured_at: new Date(+at - 1000).toISOString(), assessment: { from: +at, status: "warning", reason: { key: "disk_usage", params: { path: "/", percent: 90 } }, facts: [] } });
    });
    const queued = (await f.events())[0]!, original = queued.message_snapshot, composed: string[] = [];
    const driver: Transport = { mode: "capture", async send(mail) { composed.push(messageV2(f.settings, mail).text); return { kind: "transient", code: "connection_failed" }; } };
    await f.tick(driver);
    expect((await f.events())[0]!.message_snapshot).toEqual(original);
    await f.advanceSeconds(300); await f.diskState(2, 91); await f.db.updateTable("hosts").set({ label: "renamed" }).where("id", "=", f.hostId).execute();
    await f.tick(driver); expect(composed[1]).toBe(composed[0]); expect(composed[1]).toContain("90% full"); expect(composed[1]).not.toContain("renamed");
    await f.advanceSeconds(1800); await f.diskState(3, 92); await f.tick();
    expect((await f.events())[0]).toMatchObject({ state: "captured", message_snapshot: null });
    // Residual snapshots of dormant routes are cleared without deleting their incident/delivery records.
    await f.db.updateTable("notification_outbox").set({ message_snapshot: original }).where("id", "=", queued.id).execute();
    expect(await pruneMessageBatch(f.db, new Date(+at + 91 * 86400000))).toBe(1);
    expect(await f.events()).toHaveLength(1); expect((await f.events())[0]!.message_snapshot).toBeNull();
  });
});
