import { sql, type Transaction } from "kysely";
import type { Database } from "../db/types";
import type { DashboardHost } from "../fleet/dashboard-model";
import { retentionCutoff } from "../skills/results/retention-policy";
import { historyDayWindow } from "./day-window";
import { parseHistoryFacts } from "./facts";
import type { HistoryOptions } from "./options";
import { historyScope, historyContinuityMs } from "./types";

export async function historyEventRows(trx: Transaction<Database>, at: Date,
  options: HistoryOptions & { since?: Date; statesOnly?: boolean }) {
  let query = trx.selectFrom("history_events as e").innerJoin("hosts as h", "h.id", "e.host_id")
    .selectAll("e").select("h.label as host_label").where("e.observed_at", ">=", retentionCutoff(at)).where("e.observed_at", "<=", at);
  const hosts = options.hosts ?? (options.host ? [options.host] : []);
  if (hosts.length) query = query.where("e.host_id", "in", hosts);
  if (options.skills?.length) query = query.where("e.subject_key", "in", options.skills);
  if (options.kind) query = query.where("e.kind", "=", options.kind);
  if (options.since) query = query.where("e.observed_at", ">=", options.since);
  if (options.statesOnly) query = query.where("e.kind", "=", "state");
  if (options.after) query = query.where((eb) => eb.or([eb("e.observed_at", "<", options.after!.at),
    eb.and([eb("e.observed_at", "=", options.after!.at), eb("e.id", "<", options.after!.id)])]));
  const rows = await query.orderBy("e.observed_at", "desc").orderBy("e.id", "desc").limit(options.limit).execute();
  return rows.map((row) => ({ ...row, transition_number: Number(row.transition_number),
    observed_at: row.observed_at.toISOString(), previous_sample_at: row.previous_sample_at?.toISOString() ?? null,
    measured_at: row.measured_at?.toISOString() ?? null,
    before_facts: parseHistoryFacts(row.before_facts), after_facts: parseHistoryFacts(row.after_facts) }));
}
export type HistoryEventView = Awaited<ReturnType<typeof historyEventRows>>[number];
export async function historyOverview(trx: Transaction<Database>, at: Date) {
  const window = historyDayWindow(at);
  const control = await trx.selectFrom("history_control").selectAll().where("singleton", "=", true).executeTakeFirst();
  const counted = await trx.selectFrom("history_events").select(({ fn }) => fn.countAll<string>().as("n"))
    .where("kind", "=", "state").where("observed_at", ">=", window.start).where("observed_at", "<=", at).executeTakeFirstOrThrow();
  const count = Number(counted.n);
  if (!Number.isSafeInteger(count)) throw new Error("history_count_unavailable");
  const events = await historyEventRows(trx, at, { limit: 5, since: window.start, statesOnly: true });
  const lagging = !control || at < control.activated_at || !control.last_invocation_at ||
    at < control.last_invocation_at || at.getTime() - control.last_invocation_at.getTime() > historyContinuityMs ||
    !control.scan_completed_at || at < control.scan_completed_at || at.getTime() - control.scan_completed_at.getTime() > historyContinuityMs;
  return { timezone: window.timezone, since: window.start.toISOString(), next_midnight: window.next.toISOString(),
    count, events, available: true, lagging, epoch: control?.epoch ?? null,
    activated_at: control?.activated_at.toISOString() ?? null,
    last_capture_at: control?.last_invocation_at?.toISOString() ?? null };
}
export type HistoryOverview = Awaited<ReturnType<typeof historyOverview>>;
export async function enrichFleetSince(trx: Transaction<Database>, hosts: DashboardHost[], at: Date, epoch: string | null) {
  if (!hosts.length || !epoch) return;
  const cursors = await trx.selectFrom("history_subjects").selectAll().where("host_id", "in", hosts.map((host) => host.host_id))
    .where("epoch", "=", epoch).where("suspended", "=", false)
    .where("last_sample_at", ">=", new Date(at.getTime() - historyContinuityMs))
    .where("last_sample_at", "<=", at).execute();
  for (const host of hosts) {
    const subjects = host.group === "healthy" ? [host.contact_check, ...host.checks]
      : host.primary_key === "contact" ? [host.contact_check] : host.checks.filter((check) => check.key === host.primary_key);
    const starts = subjects.map((subject) => {
      const disk = host.checks.find((check) => check.key === "disk-local");
      const state = subject.key === "disk-local" && disk && "attention" in disk ? disk.attention ?? subject.state : subject.state;
      const cursor = cursors.find((row) => row.host_id === host.host_id && row.subject_key === subject.key &&
        row.state === state && JSON.stringify(historyScope(row)) === JSON.stringify(historyScope(subject)));
      return cursor?.continuous_since?.getTime() ?? null;
    });
    if (starts.length && starts.every((start) => start !== null)) host.since = new Date(Math.max(...starts as number[])).toISOString();
  }
}
export async function isolatedHistoryOverview(trx: Transaction<Database>, hosts: DashboardHost[], at: Date): Promise<HistoryOverview | null> {
  await sql`SAVEPOINT dashboard_history`.execute(trx);
  try {
    const view = await historyOverview(trx, at);
    await enrichFleetSince(trx, hosts, at, view.epoch);
    await sql`RELEASE SAVEPOINT dashboard_history`.execute(trx);
    return view;
  } catch {
    for (const host of hosts) host.since = null;
    await sql`ROLLBACK TO SAVEPOINT dashboard_history`.execute(trx);
    await sql`RELEASE SAVEPOINT dashboard_history`.execute(trx);
    return null;
  }
}
