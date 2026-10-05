export interface AppConfig {
  origin: string;
  databaseUrl: string;
  heartbeatIntervalSeconds: number;
  staleAfterSeconds: number;
}

function integer(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error("invalid_configuration");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error("invalid_configuration");
  }
  return parsed;
}

export function parseOrigin(value: string | undefined): string {
  if (!value) throw new Error("invalid_configuration");
  let origin: URL;
  try { origin = new URL(value); } catch { throw new Error("invalid_configuration"); }
  if (origin.protocol !== "https:" || !origin.hostname || origin.username || origin.password ||
      origin.pathname !== "/" || origin.search || origin.hash || origin.origin !== value.replace(/\/$/, "")) {
    throw new Error("invalid_configuration");
  }
  return origin.origin;
}

export function parseDatabaseUrl(value: string | undefined, role: string): string {
  if (!value) throw new Error("invalid_configuration");
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error("invalid_configuration"); }
  const socket = parsed.searchParams.get("host");
  const queryKeys = [...parsed.searchParams.keys()];
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || parsed.username !== role ||
      !/^\/[a-zA-Z0-9_]+$/.test(parsed.pathname) || parsed.hash ||
      queryKeys.some((key) => key !== "host") || queryKeys.length > (socket === null ? 0 : 1) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) ||
      (socket !== null && (!socket.startsWith("/") || socket.includes(".."))) ||
      (parsed.password && parsed.password.length > 256)) {
    throw new Error("invalid_configuration");
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const interval = integer(env.HEARTBEAT_INTERVAL_SECONDS, 60, 10, 300);
  const stale = integer(env.HEARTBEAT_STALE_AFTER_SECONDS, 180, 30, 3600);
  if (stale < 3 * interval) throw new Error("invalid_configuration");
  return {
    origin: parseOrigin(env.PUBLIC_ORIGIN),
    databaseUrl: parseDatabaseUrl(env.DATABASE_URL, "tinywarden"),
    heartbeatIntervalSeconds: interval,
    staleAfterSeconds: stale,
  };
}
