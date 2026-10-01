import { randomUUID } from "node:crypto";
import { mkdtemp, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { sql, type Kysely } from "kysely";
import { createDb } from "../server/db/client";
import { assertDatabaseTarget } from "../server/db/target";
import type { Database } from "../server/db/types";

export async function databaseSnapshot(db: Kysely<Database>) {
  const tables = (await sql<{ name: string }>`SELECT tablename AS name FROM pg_tables
    WHERE schemaname='tinywarden' ORDER BY tablename`.execute(db)).rows;
  const counts: Record<string,string> = {};
  for (const t of tables) counts[t.name] = (await sql<{ n: string }>`SELECT count(*)::text AS n
    FROM ${sql.id("tinywarden",t.name)}`.execute(db)).rows[0]!.n;
  return counts;
}
// Only synthetic data in the reserved DB can enter this bounded restore rehearsal.
export async function withRestoredFixture(sourceUrl: string, verify: (db: Kysely<Database>) => Promise<void>) {
  if (new URL(sourceUrl).pathname !== "/tinywarden_test_p1b") throw new Error("wrong_rehearsal_source");
  const source = createDb(sourceUrl);
  const name = `tinywarden_test_p4a_restore_${randomUUID().replaceAll("-", "")}`;
  const destinationUrl = new URL(sourceUrl); destinationUrl.pathname = `/${name}`;
  let destination: Kysely<Database> | undefined, created = false;
  const directory = await mkdtemp(join(tmpdir(), "tinywarden-p4a-"));
  await chmod(directory, 0o700);
  const file = join(directory,"synthetic.dump");
  const sourceConnection = new URL(sourceUrl);
  const env: NodeJS.ProcessEnv = { ...process.env, PGHOST: sourceConnection.searchParams.get("host") ?? sourceConnection.hostname,
    PGPORT: sourceConnection.searchParams.get("port") ?? (sourceConnection.port || "5432"), PGUSER: decodeURIComponent(sourceConnection.username),
    PGDATABASE: "tinywarden_test_p1b" };
  const password = sourceConnection.password ? decodeURIComponent(sourceConnection.password)
    : sourceConnection.searchParams.get("password") ?? process.env.PGPASSWORD;
  if (password) env.PGPASSWORD = password;
  const command = (program: string, args: string[], database: string) => {
    const result = spawnSync(program,args,{ env: {...env, PGDATABASE: database}, timeout: 20_000, encoding:"utf8" });
    if (result.error || result.status !== 0) throw new Error(`synthetic_${program}_failed`);
  };
  const dropOwnedTarget = async () => {
    if (!created) return;
    const owned = (await sql<{ owner: string }>`SELECT pg_get_userbyid(datdba) AS owner FROM pg_database
      WHERE datname=${name}`.execute(source)).rows[0];
    if (owned?.owner !== "tinywarden" || !name.startsWith("tinywarden_test_p4a_restore_")) throw new Error("wrong_rehearsal_owner");
    await sql`DROP DATABASE ${sql.id(name)}`.execute(source);
  };
  try {
    await assertDatabaseTarget(source,"tinywarden_test_p1b");
    command("pg_dump",["--format=custom","--file",file],"tinywarden_test_p1b");
    await chmod(file,0o600);
    command("pg_restore",["--list",file],"tinywarden_test_p1b");
    await sql`CREATE DATABASE ${sql.id(name)} OWNER tinywarden`.execute(source); created = true;
    await sql`REVOKE ALL ON DATABASE ${sql.id(name)} FROM PUBLIC`.execute(source);
    destination = createDb(destinationUrl.href);
    await assertDatabaseTarget(destination,name,false);
    command("pg_restore",["--single-transaction","--exit-on-error","--no-owner","--dbname",name,file],name);
    await assertDatabaseTarget(destination,name);
    await verify(destination);
  } finally {
    if (destination) await destination.destroy();
    try {
      await dropOwnedTarget();
    } finally { await source.destroy(); await rm(directory,{recursive:true,force:true}); }
  }
}
