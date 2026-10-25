import {runHistory as runCurrentHistory,withHistoryLock} from "../server/history/run";
import {captureHistoryFamily} from "../server/history/sampling";
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
    tick: async (driver: Transport = transport, elapsed?: () => number) => {
      // Historical fixture data is injected explicitly; current jobs only sample packages/contact.
      if(!elapsed&&driver.mode===settings.transport)await withNotificationLock(f.db,database,async connection=>{
        const current=await connection.selectFrom("notification_routes").select("id").where("id","=",routeId).where("current","=",true).where("paused","=",false).executeTakeFirst();
        if(current){
          const hosts=await connection.selectFrom("hosts").select("id").where("lifecycle","=","active").orderBy("id").limit(100).execute();
          for(const host of hosts)for(const family of ["disk-local","package-updates"] as const)await sampleFamily(connection,routeId,settings,host.id,family,f.clock);
        }
      });
      return runNotifications(f.db, database, settings, driver, f.clock, elapsed);
    },
    advanceSeconds: (seconds: number) => f.advance(new Date(f.clock().getTime() + seconds * 1000)),
    enqueue: () => withNotificationLock(f.db, database, (connection) => sampleFamily(connection, routeId, settings, f.hostId, "disk-local", f.clock)),
    events: () => f.db.selectFrom("notification_outbox").selectAll().orderBy("created_at").orderBy("id").execute(),
  };
}

// Direct historical samples keep retained-data tests independent of the current worker roster.
export async function captureHistoricalFixture(...args:Parameters<typeof runCurrentHistory>){
  const [db,expected,clock=()=>new Date()]=args;
  const result=await runCurrentHistory(...args);
  if(!("events" in result))return result;
  const extra=await withHistoryLock(db,expected,async connection=>{
    const control=await connection.selectFrom("history_control").select("epoch").executeTakeFirstOrThrow();
    const hosts=await connection.selectFrom("hosts").select("id").where("lifecycle","=","active").orderBy("id").limit(50).execute();
    let events=0;
    for(const host of hosts)for(const family of ["disk-local","package-updates"] as const)events+=await captureHistoryFamily(connection,control.epoch,host.id,family,clock);
    return events;
  });
  return {...result,events:result.events+(typeof extra==='number'?extra:0)};
}
