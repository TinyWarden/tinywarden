import { createDb } from "../server/db/client";
import { parseDatabaseUrl } from "../server/config";
import { runHistory, historyStatus, resetHistory } from "../server/history/run";
import messages from "../messages/en.json";

async function main() {
  const [action, flag, expected, extra] = process.argv.slice(2);
  if (!["run", "status", "reset"].includes(action ?? "") || flag !== "--expected-database" ||
    !expected || !/^[a-zA-Z0-9_]+$/.test(expected) || extra) throw new Error("usage");
  const url = parseDatabaseUrl(process.env.DATABASE_URL, "tinywarden");
  if (new URL(url).pathname !== `/${expected}`) throw new Error("wrong_database");
  const db = createDb(url);
  try {
    const result = action === "run" ? await runHistory(db, expected)
      : action === "reset" ? await resetHistory(db, expected) : await historyStatus(db, expected);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally { await db.destroy(); }
}
main().catch(() => { process.stderr.write(`${messages.historyCli.failed}\n`); process.exitCode = 1; });
