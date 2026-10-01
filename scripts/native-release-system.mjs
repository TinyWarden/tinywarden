import { execFileSync } from "node:child_process";
import { readFileSync, lstatSync } from "node:fs";
import { parseEnv } from "node:util";
import { createConnection } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

export function command(program, args, options = {}) {
  // Subprocess diagnostics can contain connection strings. Keep them private and
  // report only the failed phase; never forward arbitrary stderr into release logs.
  return execFileSync(program, args, { timeout: 120_000, encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"], ...options }).trim();
}

export function privateFile(file) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0) {
    throw new Error("private_file_permissions");
  }
  return readFileSync(file, "utf8");
}

export function connectionEnv(value, expected) {
  const url = new URL(value);
  if (!/^[a-zA-Z0-9_]+$/.test(expected) || url.pathname !== `/${expected}` ||
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      decodeURIComponent(url.username) !== "tinywarden") throw new Error("wrong_database");
  const result = { PGHOST: url.searchParams.get("host") ?? url.hostname,
    PGPORT: url.searchParams.get("port") ?? (url.port || "5432"), PGUSER: "tinywarden",
    PGDATABASE: expected, PGCONNECT_TIMEOUT: "5" };
  const password = url.password ? decodeURIComponent(url.password) : url.searchParams.get("password");
  if (password) result.PGPASSWORD = password;
  const sslmode = url.searchParams.get("sslmode");
  if (sslmode) result.PGSSLMODE = sslmode;
  return result;
}

export function environment(file, expected) {
  const parsed = parseEnv(privateFile(file));
  if (!parsed.DATABASE_URL || !parsed.PUBLIC_ORIGIN) throw new Error("missing_environment");
  const origin = new URL(parsed.PUBLIC_ORIGIN);
  if (origin.protocol !== "https:" || origin.origin !== parsed.PUBLIC_ORIGIN || origin.username || origin.password) {
    throw new Error("invalid_origin");
  }
  if (!/^\d+$/.test(parsed.PORT ?? "") || Number(parsed.PORT) < 1 || Number(parsed.PORT) > 65535) {
    throw new Error("invalid_port");
  }
  const inherited = { ...process.env };
  for (const key of Object.keys(inherited)) {
    if (key.startsWith("PG") || key === "DATABASE_URL") delete inherited[key];
  }
  const runtime = inherited.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid()}`;
  return { ...inherited, ...parsed, ...connectionEnv(parsed.DATABASE_URL, expected),
    XDG_RUNTIME_DIR: runtime, DBUS_SESSION_BUS_ADDRESS: `unix:path=${runtime}/bus`,
    NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "production" };
}

export function assertTarget(run, env, expected) {
  const sql = "SELECT current_database(),session_user,current_user,pg_get_userbyid(datdba)," +
    "coalesce((SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='tinywarden'),'absent') " +
    "FROM pg_database WHERE datname=current_database()";
  const found = run("psql", ["-X", "-A", "-t", "-F", "|", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { env, timeout: 10_000 });
  if (![`${expected}|tinywarden|tinywarden|tinywarden|tinywarden`,
    `${expected}|tinywarden|tinywarden|tinywarden|absent`].includes(found)) throw new Error("wrong_database_owner");
}

export function npmCommand(run, env) {
  const custom = env.TW_NPM_CLI;
  const executable = custom ? process.execPath : "npm";
  const prefix = custom ? [custom] : [];
  if (run(executable, [...prefix, "--version"], { env, timeout: 10_000 }) !== "11.16.0") {
    throw new Error("wrong_npm_version");
  }
  return (args, options) => run(executable, [...prefix, ...args], { env, ...options });
}

export async function waitListener(env) {
  const deadline = performance.now() + 20_000;
  while (performance.now() < deadline) {
    const ready = await new Promise((resolve) => {
      const socket = createConnection({ host: "127.0.0.1", port: Number(env.PORT) });
      const finish = (result) => { socket.destroy(); resolve(result); };
      socket.once("connect", () => finish(true)); socket.once("error", () => finish(false));
      socket.setTimeout(1000, () => finish(false));
    });
    if (ready) return;
    await delay(250);
  }
  throw new Error("listener_not_ready");
}

export async function smoke(env, cookieFile, request = fetch) {
  const cookie = privateFile(cookieFile).trim();
  if (!cookie || cookie.includes("\n") || cookie.includes("\r")) throw new Error("invalid_cookie_file");
  for (const path of ["/login", "/api/v1/operator/hosts"]) {
    const response = await request(`${env.PUBLIC_ORIGIN}${path}`, { redirect: "manual",
      headers: path === "/api/v1/operator/hosts" ? { cookie } : {}, signal: AbortSignal.timeout(5000) });
    await response.body?.cancel();
    if (response.status !== 200) throw new Error("smoke_failed");
  }
}
