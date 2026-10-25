import {usesResourceCollections} from '../../lib/skills/resource-mode';
import {collectionReadRoot} from "../fleet/management";
import {fleetHostLock} from "../fleet/control";
import {resourceProjections} from "../skills/resources/projection";
import type { Kysely } from "kysely";
import type { Database } from "../db/types";
import type { HistoryKey } from "./types";
import { contactSummary } from "../fleet/contact";
import { diskHealthSummary } from "../skills/results/disk-health";
import { baselineHealthSummaries } from "../skills/results/baseline-health";
import { historyScope, type HistorySample } from "./types";
import { recordHistorySample } from "./transitions";
import { sql } from "kysely";
import { packageProjections } from "../skills/results/package-projection";

export async function captureHistoryFamily(db: Kysely<Database>, epoch: string,
  hostId: string, family: HistoryKey | "packages", clock: () => Date) {
  return db.transaction().execute(async (trx) => {
    await sql`SET LOCAL statement_timeout='5s'`.execute(trx);
    await sql`SET LOCAL transaction_timeout='5s'`.execute(trx);
    await sql`SET LOCAL lock_timeout='250ms'`.execute(trx);
    await collectionReadRoot(trx);const host=await fleetHostLock(trx,hostId);if(!host||host.lifecycle!=="active")return 0;
    let samples: HistorySample[];
    const base=await packageProjections(trx,[hostId],clock());
    const packages = await resourceProjections(trx,family==='packages'?base:base.filter(p=>!usesResourceCollections(p.metadata)),family==='packages'?{consumer:'history',scope:epoch,host:hostId,at:clock()}:undefined);
    const owned = packages.filter((p) => p.package_lane && !p.key.includes("/"));
    if (family === "contact") {
      const s = await contactSummary(trx, hostId, clock);
      samples = [{ ...historyScope(s), host_id: hostId, key: "contact", state: s.state,
        reason: s.reason, as_of: s.as_of, facts: s.facts, suspend: false }];
    } else if (family === "packages") {
      samples = packages.filter((p) => p.key.includes("/")).map((s) => ({ ...s, ...historyScope(s) }));
    } else if (family === "disk-local") {
      const s = await diskHealthSummary(trx, hostId, clock);
      samples = [{ ...historyScope(s), host_id: hostId, key: "disk-local", state: s.attention ?? s.state,
        reason: s.reason, as_of: s.as_of, facts: s.facts, suspend: s.state !== "disabled" && !s.contact_current }];
    } else {
      const summaries = await baselineHealthSummaries(trx, hostId, clock);
      samples = summaries.map((s) => ({ ...historyScope(s), host_id: hostId, key: s.key,
        state: s.state, reason: s.reason, as_of: s.as_of, facts: s.facts, suspend: s.state !== "disabled" && !s.contact_current }));
    }
    if (family !== "contact" && family !== "packages") samples = samples.map((s) => {
      const packageSample = owned.find((p) => p.key === s.key);
      return packageSample ? { ...packageSample, ...historyScope(packageSample) } : s;
    });
    const control = await trx.selectFrom("history_control").selectAll().where("singleton", "=", true).forShare().executeTakeFirst();
    if (!control || control.epoch !== epoch) throw new Error("history_epoch_changed");
    if (samples.some((sample) => new Date(sample.as_of) < control.activated_at ||
      control.last_invocation_at && new Date(sample.as_of) < control.last_invocation_at)) throw new Error("history_clock_rollback");
    let events = 0;
    for (const sample of samples) events += (await recordHistorySample(trx, epoch, sample)).events;
    return events;
  });
}
