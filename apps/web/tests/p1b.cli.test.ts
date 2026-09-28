import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createDb } from "../server/db/client";
import { parseDatabaseUrl } from "../server/config";

const url = process.env.TW_TEST_DATABASE_URL;
if (url && new URL(parseDatabaseUrl(url, "tinywarden")).pathname !== "/tinywarden_test_p1b") {
  throw new Error("P1.B CLI tests require the owned test database");
}

describe.skipIf(!url)("P1.B local administrator CLI", () => {
  it("refuses a non-interactive setup attempt with a catalog message", async () => {
    const result = await new Promise<{ status: number; output: string }>((resolve, reject) => {
      const child = spawn("npm", ["run", "operator", "--", "init"], {
        cwd: fileURLToPath(new URL("../", import.meta.url)),
        env: { ...process.env, DATABASE_URL: url }, stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      child.stdout.on("data", (part: Buffer) => { output += part.toString(); });
      child.stderr.on("data", (part: Buffer) => { output += part.toString(); });
      child.on("error", reject);
      child.on("exit", (status) => resolve({ status: status ?? -1, output }));
    });
    expect(result.status).toBe(1);
    expect(result.output).toContain("Run this command in an interactive terminal.");
  });
  it("reads a synthetic password from a hidden terminal prompt", async () => {
    const db = createDb(url!);
    try {
      const identity = await sql<{ db: string; role: string; owner: string; schema: string }>`
        SELECT current_database() AS db, session_user AS role,
          (SELECT pg_get_userbyid(datdba) FROM pg_database
            WHERE datname = current_database()) AS owner,
          (SELECT pg_get_userbyid(nspowner) FROM pg_namespace
            WHERE nspname = 'tinywarden') AS schema`.execute(db);
      expect(identity.rows[0]).toEqual({ db: "tinywarden_test_p1b", role: "tinywarden",
        owner: "tinywarden", schema: "tinywarden" });
    } finally { await db.destroy(); }
    const result = await new Promise<{ status: number; output: string }>((resolve, reject) => {
      const child = spawn("python3", [fileURLToPath(new URL("./operator-tty.py", import.meta.url))], {
        env: { ...process.env, DATABASE_URL: url }, stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      child.stdout.on("data", (part: Buffer) => { output += part.toString(); });
      child.stderr.on("data", (part: Buffer) => { output += part.toString(); });
      child.on("error", reject);
      child.on("exit", (status) => resolve({ status: status ?? -1, output }));
    });
    expect(result.status, result.output).toBe(0);
    expect(result.output.trim()).toBe("operator_tty_prompt_hidden");
  }, 30000);
});
