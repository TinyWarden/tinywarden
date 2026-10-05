import { sql, type Transaction } from "kysely";
import type { Database } from "../db/types";
import { retentionCutoff } from "../skills/results/retention-policy";
import { historyKeys } from "./types";
import type { HistoryOptions } from "./options";

function count(value: unknown) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("history_count_unavailable");
  return n;
}
export async function historyFilters(trx: Transaction<Database>, at: Date, options: HistoryOptions) {
  const retained = () => trx.selectFrom("history_events").where("observed_at", ">=", retentionCutoff(at)).where("observed_at", "<=", at);
  let matching = retained();
  const hosts = options.hosts ?? (options.host ? [options.host] : []);
  if (hosts.length) matching = matching.where("host_id", "in", hosts);
  if (options.skills?.length) matching = matching.where("subject_key", "in", options.skills);
  if (options.kind) matching = matching.where("kind", "=", options.kind);
  const totals = await matching.select(({ fn }) => [fn.countAll<string>().as("events"),
    fn.count<string>("host_id").distinct().as("servers"), fn.count<string>("subject_key").distinct().as("skills"),
    fn.min("observed_at").as("earliest"), fn.max("observed_at").as("latest")]).executeTakeFirstOrThrow();
  const perHost = retained().select("host_id").select(({ fn }) => fn.countAll<string>().as("events")).groupBy("host_id").as("counts");
  let inventory = trx.selectFrom("hosts as h").leftJoin(perHost, "counts.host_id", "h.id");
  if (options.search) inventory = inventory.where(sql<boolean>`strpos(lower(h.label), lower(${options.search})) > 0`);
  const matches = await inventory.select(({ fn }) => fn.countAll<string>().as("n")).executeTakeFirstOrThrow();
  let choices = inventory.select(["h.id", "h.label", sql<string>`coalesce(counts.events, 0)`.as("count")]);
  if (hosts.length) choices = choices.orderBy(sql<number>`case when h.id in (${sql.join(hosts)}) then 0 else 1 end`);
  const servers = await choices.orderBy(sql<number>`case when coalesce(counts.events, 0) > 0 then 0 else 1 end`)
    .orderBy("h.label").orderBy("h.id").limit(100).execute();
  const skills = await retained().select("subject_key").select(({ fn }) => fn.countAll<string>().as("n")).groupBy("subject_key").execute();
  const installed = await trx.selectFrom("skill_installations as i").innerJoin("skill_packages as p", "p.content_sha256", "i.content_sha256")
    .select(["i.subject_key", "p.metadata"]).orderBy("i.created_at").limit(100).execute();
  const keys = [...new Set([...historyKeys, ...installed.map((p) => p.subject_key as typeof historyKeys[number]), ...skills.map((s) => s.subject_key)])];
  return { servers: servers.map((s) => ({ ...s, count: count(s.count) })), server_matches: count(matches.n), server_limit: 100,
    skills: keys.map((key) => {
      const p = installed.find((p) => p.subject_key === key);
      return { key, label: p?.metadata.catalog[p.metadata.manifest.name_key]?.text ?? null,
        count: count(skills.find((s) => s.subject_key === key)?.n ?? 0) };
    }),
    totals: { events: count(totals.events), servers: count(totals.servers), skills: count(totals.skills) },
    retained_from: retentionCutoff(at).toISOString(), earliest_match_at: totals.earliest?.toISOString() ?? null, latest_match_at: totals.latest?.toISOString() ?? null };
}
