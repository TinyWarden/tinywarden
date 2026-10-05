import type { Kysely, Transaction } from "kysely";
import type { Database } from "../../db/types";
import { authorize, completeAuthorization } from "../../access/session";
import { uuid } from "../../validation";
import { captureDiskHealth } from "./disk-evidence";
export type { DiskHealthState, MountHistory, RunHistory } from "../legacy/disk/health-types";

export async function readDiskHealth(db: Kysely<Database>, cookie: string,
  rawHostId: string, clock: () => Date) {
  const hostId = uuid(rawHostId);
  return db.transaction().execute(async (trx) => {
    const actor = await authorize(trx, cookie, clock);
    const { view } = await captureDiskHealth(trx, hostId, clock);
    await completeAuthorization(trx, actor, clock());
    return view;
  });
}

// Local system consumers receive only the current projection, never history/body.
export async function diskHealthSummary(trx: Transaction<Database>, hostId: string, clock: () => Date) {
  return (await captureDiskHealth(trx, uuid(hostId), clock, false)).summary;
}
