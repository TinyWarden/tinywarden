import { assertDatabaseTarget } from "./target";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Kysely, PostgresDialect } from "kysely";
import { Migrator, FileMigrationProvider } from "kysely/migration";
import { Pool } from "pg";
import { parseDatabaseUrl } from "../config";
import messages from "../../messages/en.json";

export async function migrate(url: string, expected: string): Promise<void> {
  parseDatabaseUrl(url, "tinywarden");
  if (!/^[a-zA-Z0-9_]+$/.test(expected) || new URL(url).pathname !== `/${expected}`) {
    throw new Error("wrong_database");
  }
  const db = new Kysely<unknown>({ dialect: new PostgresDialect({
    pool: new Pool({ connectionString: url, max: 2, connectionTimeoutMillis: 2000,
      options: "-c statement_timeout=5000 -c lock_timeout=2000 -c transaction_timeout=10000" }),
  }) });
  try {
    await assertDatabaseTarget(db, expected, false);
    const migrator = new Migrator({ db, migrationTableSchema: "tinywarden",
      provider: new FileMigrationProvider({ fs, path,
        migrationFolder: fileURLToPath(new URL("./migrations/", import.meta.url)),
        onFileIgnored: (file) => { throw new Error(`invalid_migration_file:${file}`); },
      }) });
    const { error } = await migrator.migrateToLatest();
    if (error) throw error;
  } finally { await db.destroy(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const expected = process.argv[2];
  if (!expected || process.argv.length !== 3 || !/^[a-zA-Z0-9_]+$/.test(expected)) {
    process.stderr.write(`${messages.migrationCli.usage}\n`);
    process.exitCode = 2;
  } else {
    try {
      const url = parseDatabaseUrl(process.env.DATABASE_URL, "tinywarden");
      await migrate(url, expected);
      process.stdout.write(`${messages.migrationCli.complete}\n`);
    } catch {
      process.stderr.write(`${messages.migrationCli.failed}\n`);
      process.exitCode = 1;
    }
  }
}
