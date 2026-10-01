import { createDb } from "../server/db/client";
import { parseDatabaseUrl } from "../server/config";
import { pruneExpiredObservations } from "../server/checks/retention";
import messages from "../messages/en.json";

async function main() {
  const args = process.argv.slice(2), apply = args.includes("--apply");
  const expected = args[args.indexOf("--expected-database") + 1];
  if (args[0] !== "--expected-database" || !expected || !/^[a-zA-Z0-9_]+$/.test(expected) ||
      args.length !== (apply ? 3 : 2) || apply && args[2] !== "--apply") throw new Error("usage");
  const url = parseDatabaseUrl(process.env.DATABASE_URL, "tinywarden");
  if (new URL(url).pathname !== `/${expected}`) throw new Error("wrong_database");
  const db = createDb(url);
  try {
    const result = await pruneExpiredObservations(db, expected, apply);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.outcome === "failed" || result.outcome === "retryable") process.exitCode = 1;
  } finally { await db.destroy(); }
}
main().catch(() => {
  process.stderr.write(`${messages.retentionCli.failed}\n`);
  process.exitCode = 1;
});
