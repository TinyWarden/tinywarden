import { sql, type Kysely } from "kysely";
import type { Database } from "../db/types";
import { authorize, completeAuthorization } from "../access/session";
import { fail } from "../errors";
import { fleetEvidence } from "../skills/results/fleet-evidence";
import { isolatedHistoryOverview } from "../history/read-model";
import { fleetGroups, projectFleetHost, compareFleetRows, fleetCursor, type DashboardHost,
  type DashboardCursors, type FleetGroup } from "./dashboard-model";

export async function readDashboard(db: Kysely<Database>, cookie: string, cursors: DashboardCursors,
  clock = () => new Date(), elapsed = () => performance.now()) {
  return db.transaction().setIsolationLevel("repeatable read").execute(async (trx) => {
    await sql`SET LOCAL transaction_timeout='20s'`.execute(trx);
    await sql`SET LOCAL statement_timeout='5s'`.execute(trx);
    const started = elapsed(), actor = await authorize(trx, cookie, clock), at = actor.at;
    const counts = { total: 0, attention: 0, critical: 0, warning: 0, unknown: 0, healthy: 0 };
    const candidates: Record<FleetGroup, DashboardHost[]> = { attention: [], unknown: [], healthy: [] };
    let after = "00000000-0000-0000-0000-000000000000", validUntil: string | null = null;
    while (true) {
      if (elapsed() - started >= 20000) fail("temporarily_unavailable", 503);
      const hosts = await trx.selectFrom("hosts").selectAll().where("id", ">", after).orderBy("id").limit(50).execute();
      if (!hosts.length) break;
      for (const evidence of await fleetEvidence(trx, hosts, at)) {
        const host = projectFleetHost(evidence); counts.total++; counts[host.group]++;
        if (host.priority === 0) counts.critical++; else if (host.priority === 1) counts.warning++;
        for (const deadline of [host.contact_check.valid_until, ...host.checks.map((check) => check.valid_until), evidence.disk.fact_valid_until]) {
          if (deadline && (!validUntil || deadline < validUntil)) validUntil = deadline;
        }
        const cursor = cursors[host.group];
        if (!cursor || compareFleetRows(host, cursor) > 0) {
          const page = candidates[host.group]; page.push(host); page.sort(compareFleetRows);
          if (page.length > 26) page.pop();
        }
      }
      after = hosts.at(-1)!.id;
      if (hosts.length < 50) break;
    }
    const groups = Object.fromEntries(fleetGroups.map((group) => {
      const hosts = candidates[group].slice(0, 25), last = hosts.at(-1);
      return [group, { hosts, next_cursor: candidates[group].length > 25 && last ? fleetCursor(last) : null }];
    })) as Record<FleetGroup, { hosts: DashboardHost[]; next_cursor: string | null }>;
    const history = await isolatedHistoryOverview(trx, fleetGroups.flatMap((group) => groups[group].hosts), at);
    if (elapsed() - started >= 20000) fail("temporarily_unavailable", 503);
    await completeAuthorization(trx, actor, clock());
    return { as_of: at.toISOString(), valid_until: validUntil, counts, groups, history };
  });
}
export type DashboardView = Awaited<ReturnType<typeof readDashboard>>;
