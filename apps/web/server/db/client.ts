import { Kysely, PostgresDialect, WithSchemaPlugin } from "kysely";
import { Pool, type PoolClient } from "pg";
import type { Database } from "./types";

const failures = new WeakMap<Kysely<Database>, Map<number, Set<() => void>>>();
export function observeConnectionFailure(db: Kysely<Database>, pid: number, listener: () => void) {
  const registry = failures.get(db);
  if (!registry) throw new Error("unmanaged_database_connection");
  const listeners = registry.get(pid) ?? new Set<() => void>();
  listeners.add(listener); registry.set(pid, listeners);
  return () => { listeners.delete(listener); if (!listeners.size) registry.delete(pid); };
}

export function createDb(url: string): Kysely<Database> {
  const pool = new Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 30000, allowExitOnIdle: true,
    options: "-c statement_timeout=5000 -c lock_timeout=2000 -c transaction_timeout=10000" });
  const registry = new Map<number, Set<() => void>>();
  // Driver query promises report active-query failures; this handles idle/transport-time events too.
  pool.on("connect", (client: PoolClient) => client.on("error", () => {
    const pid = (client as PoolClient & { processID: number }).processID;
    for (const listener of registry.get(pid) ?? []) listener();
  }));
  pool.on("error", () => undefined);
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }),
    plugins: [new WithSchemaPlugin("tinywarden")] });
  failures.set(db, registry);
  return db;
}

let singleton: Kysely<Database> | undefined;
export function runtimeDb(url: string): Kysely<Database> {
  singleton ??= createDb(url);
  return singleton;
}
