import { sql, type Kysely } from "kysely";
import type { Database } from "../db/types";
import { observeConnectionFailure } from "../db/client";
import { assertDatabaseTarget } from "../db/target";
// A dedicated checked-out session owns this lock through SMTP; no SQL transaction spans I/O.
export async function withNotificationLock<T>(db: Kysely<Database>, expected: string,
  work: (connection: Kysely<Database>, signal: AbortSignal) => Promise<T>): Promise<T | { outcome: "busy" }> {
  return db.connection().execute(async (connection) => {
    await assertDatabaseTarget(connection, expected);
    const { rows } = await sql<{ acquired: boolean; pid: number }>`SELECT pg_try_advisory_lock(1415007823,4) AS acquired, pg_backend_pid() AS pid`.execute(connection);
    if (!rows[0]?.acquired) return { outcome: "busy" as const };
    const controller = new AbortController();
    let unwatch = () => {};
    try {
      unwatch = observeConnectionFailure(db, rows[0]!.pid, () => controller.abort());
      return await work(connection, controller.signal);
    }
    finally {
      unwatch();
      controller.abort();
      await sql`SELECT pg_advisory_unlock(1415007823,4)`.execute(connection).catch(() => undefined);
    }
  });
}
