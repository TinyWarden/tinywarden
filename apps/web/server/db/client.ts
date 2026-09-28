import { Kysely, PostgresDialect, WithSchemaPlugin } from "kysely";
import { Pool } from "pg";
import type { Database } from "./types";

export function createDb(url: string): Kysely<Database> {
  const pool = new Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 30000, allowExitOnIdle: true,
    options: "-c statement_timeout=5000 -c lock_timeout=2000 -c transaction_timeout=10000" });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }),
    plugins: [new WithSchemaPlugin("tinywarden")] });
}

let singleton: Kysely<Database> | undefined;
export function runtimeDb(url: string): Kysely<Database> {
  singleton ??= createDb(url);
  return singleton;
}
