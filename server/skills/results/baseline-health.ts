import type { Kysely, Transaction } from "kysely";
import type { Database } from "../../db/types";
import { authorize, completeAuthorization } from "../../access/session";
import { uuid } from "../../validation";
import { captureBaselineHealth } from "./baseline-evidence";
export type { BaselineHistory } from "./baseline-evidence";

export async function readBaselineHealth(db: Kysely<Database>, cookie: string, rawHostId: string, clock: () => Date) {
  const hostId = uuid(rawHostId);
  return db.transaction().execute(async (trx) => {
    const actor = await authorize(trx, cookie, clock);
    const { view } = await captureBaselineHealth(trx, hostId, clock);
    await completeAuthorization(trx, actor, clock());
    return view;
  });
}

export async function baselineHealthSummaries(trx: Transaction<Database>, hostId: string, clock: () => Date) {
  return (await captureBaselineHealth(trx, uuid(hostId), clock, false)).summaries;
}
