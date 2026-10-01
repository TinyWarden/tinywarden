import type { Kysely, Transaction } from "kysely";
import type { Database } from "../db/types";
import type { NotificationKey } from "../db/notification-types";
import { contactSummary } from "../fleet/contact";
import { diskHealthSummary } from "../checks/health";
import { baselineHealthSummaries } from "../checks/baseline-health";
import { sampleTransition } from "./transitions";
import type { Settings } from "./config";
import type { Summary } from "./types";

export async function activeRoute(trx: Transaction<Database>, routeId: string, settings: Settings) {
  const route = await trx.selectFrom("notification_routes").selectAll().where("id", "=", routeId).where("current", "=", true).executeTakeFirstOrThrow();
  if (route.paused || route.transport !== settings.transport || !route.fingerprint.equals(settings.fingerprint)) throw new Error("notification_route_unavailable");
  return route;
}
export async function sampleFamily(db: Kysely<Database>, routeId: string, settings: Settings,
  hostId: string, key: NotificationKey, clock: () => Date,
  after?: (trx: Transaction<Database>, summaries: Summary[]) => Promise<void>) {
  return db.transaction().execute(async (trx) => {
    const summaries: Summary[] = key === "contact" ? [await contactSummary(trx, hostId, clock)]
      : key === "disk-local" ? [await diskHealthSummary(trx, hostId, clock)]
      : await baselineHealthSummaries(trx, hostId, clock);
    const route = await activeRoute(trx, routeId, settings);
    for (const summary of summaries) await sampleTransition(trx, route, settings, summary);
    await after?.(trx, summaries);
    return summaries;
  });
}
