import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { createDb } from "../server/db/client";
import { parseDatabaseUrl } from "../server/config";
import { initOperator, resetPassword } from "../server/access/operator";
import messages from "../messages/en.json";

async function hiddenPrompt(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("tty_required");
  const quiet = new Writable({ write(chunk: Buffer, _encoding, callback) {
    void chunk;
    callback();
  } });
  const prompt = createInterface({ input: process.stdin, output: quiet, terminal: true });
  try {
    process.stdout.write(label);
    const answer = await new Promise<string>((resolve) => {
      prompt.question(label, resolve);
    });
    process.stdout.write("\n");
    return answer;
  } finally { prompt.close(); }
}

async function main(): Promise<void> {
  const action = process.argv[2];
  if ((action !== "init" && action !== "reset-password") || process.argv.length !== 3) {
    throw new Error("usage");
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("tty_required");
  const url = parseDatabaseUrl(process.env.DATABASE_URL, "tinywarden");
  const first = await hiddenPrompt(messages.operatorCli.newPassword);
  const second = await hiddenPrompt(messages.operatorCli.repeatPassword);
  if (first !== second) throw new Error("password_mismatch");
  const db = createDb(url);
  try {
    if (action === "init") await initOperator(db, first, () => new Date(), randomUUID());
    else await resetPassword(db, first, () => new Date(), randomUUID());
  } finally { await db.destroy(); }
  process.stdout.write(`${messages.operatorCli.updated}\n`);
}

main().catch((error: unknown) => {
  const code = error instanceof Error && ["usage", "tty_required", "password_mismatch",
    "invalid_request", "invalid_configuration", "operator_exists", "setup_required"].includes(error.message)
    ? error.message : "operator_command_failed";
  process.stderr.write(`${messages.operatorCli.errors[code as keyof typeof messages.operatorCli.errors]}\n`);
  process.exitCode = 1;
});
