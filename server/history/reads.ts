import { sql, type Kysely } from "kysely";
import type { Database } from "../db/types";
import { authorize, completeAuthorization } from "../access/session";
import { fail } from "../errors";
import { historyEventRows, historyOverview } from "./read-model";

import { historyFilters } from "./filter-model";
import { filterIdentity, type HistoryOptions } from "./options";
export { historyOptions } from "./options";
export type { HistoryOptions } from "./options";
export async function readHistory(db: Kysely<Database>, cookie: string, options: HistoryOptions, clock = () => new Date()) {
  return db.transaction().setIsolationLevel("repeatable read").execute(async (trx) => {
    await sql`SET LOCAL transaction_timeout='20s'`.execute(trx);
    await sql`SET LOCAL statement_timeout='5s'`.execute(trx);
    const actor = await authorize(trx, cookie, clock), at = actor.at;
    const hosts = options.hosts ?? (options.host ? [options.host] : []);
    if (hosts.length && (await trx.selectFrom("hosts").select("id").where("id", "in", hosts).execute()).length !== hosts.length) fail("not_found", 404);
    const rows = await historyEventRows(trx, at, { ...options, limit: options.limit + 1 });
    const events = rows.slice(0, options.limit), last = events.at(-1);
    const overview = await historyOverview(trx, at);
    const filters = await historyFilters(trx, at, options);
    await completeAuthorization(trx, actor, clock());
    return { as_of: at.toISOString(), events, filters, capture: { activated_at: overview.activated_at,
      last_capture_at: overview.last_capture_at, lagging: overview.lagging, timezone: overview.timezone },
      next_cursor: rows.length > options.limit && last ? Buffer.from(JSON.stringify([
        filterIdentity(options), last.observed_at, last.id])).toString("base64url") : null };
  });
}
export type HistoryView = Awaited<ReturnType<typeof readHistory>>;
