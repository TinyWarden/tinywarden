import {outsideMaintenance} from "./maintenance";
import {hostScope,accessView} from "../access/scope";
import { sql, type Kysely } from "kysely";
import type { Database } from "../db/types";
import { authorize, completeAuthorization } from "../access/session";
import { fail } from "../errors";
import {snapshotRead} from "../db/snapshot-read";
import { fleetEvidence } from "../skills/results/fleet-evidence";
import { isolatedHistoryOverview } from "../history/read-model";
import {storedLayout,dashboardCatalog,resolveColumns} from "./dashboard-layout";
import {dashboardValues} from "./dashboard-values";
import {maintenanceForHosts} from "../agent-updates/status";
import { fleetGroups, projectFleetHost, compareFleetRows, fleetCursor, type DashboardHost,
  type DashboardCursors, type FleetGroup } from "./dashboard-model";

export async function readDashboard(db: Kysely<Database>, cookie: string, cursors: DashboardCursors,
  clock = () => new Date(), elapsed = () => performance.now()) {
  return snapshotRead(db,async (trx) => {
    await sql`SET LOCAL transaction_timeout='20s'`.execute(trx);
    await sql`SET LOCAL statement_timeout='5s'`.execute(trx);
    const started = elapsed(), actor = await authorize(trx, cookie, clock), at = actor.at;
    const saved=await storedLayout(trx,actor.operatorId),columns=resolveColumns(saved.layout,await dashboardCatalog(trx,actor,saved.layout.sections[0].columns));
    const counts = { total: 0, attention: 0, critical: 0, warning: 0, unknown: 0, healthy: 0 };
    const candidates: Record<FleetGroup, DashboardHost[]> = { attention: [], unknown: [], healthy: [] };
    let after = "00000000-0000-0000-0000-000000000000", validUntil: string | null = null;
    while (true) {
      if (elapsed() - started >= 20000) fail("temporarily_unavailable", 503);
      const hosts = await trx.selectFrom("hosts").selectAll().where(hostScope(actor,"hosts.id")).where("lifecycle","=","active").where(outsideMaintenance("hosts.id",at)).where("id", ">", after).orderBy("id").limit(50).execute();
      if (!hosts.length) break;
      for (const evidence of await fleetEvidence(trx, hosts, at)) {
        const host = projectFleetHost(evidence); host.dashboard_values=dashboardValues(evidence,columns); counts.total++; counts[host.group]++;
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
    const managementCounts=(await sql<{paused:string;maintenance:string}>`SELECT
      count(*) FILTER(WHERE hosts.lifecycle='paused')::text paused,
      count(*) FILTER(WHERE hosts.lifecycle='active' AND NOT ${outsideMaintenance("hosts.id",at)})::text maintenance
      FROM tinywarden.hosts WHERE ${hostScope(actor,"hosts.id")}`.execute(trx)).rows[0]!;
    const groups = Object.fromEntries(fleetGroups.map((group) => {
      const hosts = candidates[group].slice(0, 25), last = hosts.at(-1);
      return [group, { hosts, next_cursor: candidates[group].length > 25 && last ? fleetCursor(last) : null }];
    })) as Record<FleetGroup, { hosts: DashboardHost[]; next_cursor: string | null }>;
    const visible=fleetGroups.flatMap(group=>groups[group].hosts),maintenance=await maintenanceForHosts(trx,visible.map(h=>h.host_id),at);
    for(const host of visible){const value=maintenance.get(host.host_id);if(value)host.maintenance=value;}
    const history = await isolatedHistoryOverview(trx, visible, at,actor);
    if (elapsed() - started >= 20000) fail("temporarily_unavailable", 503);
    await completeAuthorization(trx, actor, clock());
    const view={fleet_management:{paused:Number(managementCounts.paused),maintenance:Number(managementCounts.maintenance)},access:accessView(actor),as_of:at.toISOString(),valid_until:validUntil,counts,groups,history,layout:saved.layout,layout_revision:saved.revision,columns};
    while(Buffer.byteLength(JSON.stringify({schema_version:1,...view}))>4*1024*1024){
      const group=[...fleetGroups].sort((a,b)=>Buffer.byteLength(JSON.stringify(groups[b].hosts))-Buffer.byteLength(JSON.stringify(groups[a].hosts))).find(g=>groups[g].hosts.length>1);
      if(!group)fail("temporarily_unavailable",503);
      groups[group].hosts.pop();groups[group].next_cursor=fleetCursor(groups[group].hosts.at(-1)!);
    }
    return view;
  });
}
export type DashboardView = Awaited<ReturnType<typeof readDashboard>>;
