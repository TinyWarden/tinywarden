import { lifecycleFixture, resetTestSchema, url } from "./p4a.fixture";
import { notificationSettings } from "../server/notifications/config";
import { configureNotifications } from "../server/notifications/control";
import { createCaptureTransport } from "../server/notifications/transport";
import { runNotifications } from "../server/notifications/run";
import { sampleFamily } from "../server/notifications/sampling";
import { withNotificationLock } from "../server/notifications/lock";
import type { Transport } from "../server/notifications/types";
export { url };
export const database = "tinywarden_test_p1b";
export const captureEnv = { NOTIFICATIONS_TRANSPORT: "capture", NOTIFICATIONS_FROM: "alerts@example.test",
  NOTIFICATIONS_TO: "operator@example.test", PUBLIC_ORIGIN: "https://notifications.example.test" };
export async function notificationFixture() {
  await resetTestSchema();
  const f = await lifecycleFixture();
  await f.advance(f.clock());
  const settings = notificationSettings(captureEnv), captured: Buffer[] = [];
  const configured = await configureNotifications(f.db, database, settings, false, f.clock);
  if (!("routeId" in configured)) throw new Error("fixture_busy");
  const routeId = configured.routeId;
  const transport = createCaptureTransport(settings, captured);
  const disk = async (sequence: number, used = 90) => {
    const run = f.disk(sequence), mount = run.mounts[0]!;
    mount.available_bytes = String(100 - used); mount.free_bytes = String(100 - used);
    const result = await f.diskPost(run);
    if (result.status !== 200) throw new Error("fixture_disk_failed");
    return run;
  };
  return { ...f, settings, routeId, captured, transport, diskState: disk,
    tick: (driver: Transport = transport, elapsed?: () => number) => runNotifications(f.db, database, settings, driver, f.clock, elapsed),
    advanceSeconds: (seconds: number) => f.advance(new Date(f.clock().getTime() + seconds * 1000)),
    enqueue: () => withNotificationLock(f.db, database, (connection) => sampleFamily(connection, routeId, settings, f.hostId, "disk-local", f.clock)),
    events: () => f.db.selectFrom("notification_outbox").selectAll().orderBy("created_at").orderBy("id").execute(),
  };
}
