import type { Kysely, Transaction } from "kysely";
import type { Database } from "../db/types";
import type { NotificationKey } from "../db/notification-types";
import { contactSummary } from "../fleet/contact";
import { diskHealthSummary } from "../skills/results/disk-health";
import { baselineHealthSummaries } from "../skills/results/baseline-health";
import { sampleTransition } from "./transitions";
import type { Settings } from "./config";
import type { Summary } from "./types";
import { packageProjections } from "../skills/results/package-projection";
import { isPackageSkillId } from "../../lib/skills/package-types";

export async function activeRoute(trx: Transaction<Database>, routeId: string, settings: Settings) {
  const route = await trx.selectFrom("notification_routes").selectAll().where("id", "=", routeId).where("current", "=", true).executeTakeFirstOrThrow();
  if (route.paused || route.transport !== settings.transport || !route.fingerprint.equals(settings.fingerprint)) throw new Error("notification_route_unavailable");
  return route;
}
export async function sampleFamily(db: Kysely<Database>, routeId: string, settings: Settings,
  hostId: string, key: NotificationKey | "packages", clock: () => Date,
  after?: (trx: Transaction<Database>, summaries: Summary[]) => Promise<void>) {
  return db.transaction().execute(async (trx) => {
    const packages = await packageProjections(trx, [hostId], clock());
    const legacy: Summary[] = key === "packages" || isPackageSkillId(key) ? [] : key === "contact" ? [await contactSummary(trx, hostId, clock)]
      : key === "disk-local" ? [await diskHealthSummary(trx, hostId, clock)]
      : await baselineHealthSummaries(trx, hostId, clock);
    const summaries: Summary[] = key === "packages" ? packages.filter((p) => isPackageSkillId(p.key))
      : isPackageSkillId(key) ? packages.filter((p) => p.key === key)
      : legacy.map((s) => packages.find((p) => p.key === s.key && p.package_lane) ?? s);
    const route = await activeRoute(trx, routeId, settings);
    for (const summary of summaries) await sampleTransition(trx, route, settings, summary);
    await after?.(trx, summaries);
    return summaries;
  });
}
