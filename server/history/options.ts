import { createHash } from "node:crypto";
import { fail } from "../errors";
import { uuid } from "../validation";
import { historyKeys, type HistoryKey } from "./types";
import { isPackageSkillId } from "../../lib/skills/package-types";

export type HistoryKind = "state" | "gap" | "context";
export interface HistoryOptions {
  limit: number; host?: string; hosts?: string[]; skills?: HistoryKey[]; kind?: HistoryKind;
  search?: string; after?: { at: Date; id: string };
}
export function filterIdentity(options: HistoryOptions) {
  return createHash("sha256").update(JSON.stringify([
    [...(options.hosts ?? (options.host ? [options.host] : []))].sort(),
    [...(options.skills ?? [])].sort(), options.kind ?? null,
  ])).digest("hex");
}
export function historyOptions(search: string): HistoryOptions {
  const query = new URLSearchParams(search), keys = [...query.keys()];
  if (search.length > 4096 || keys.some((key) => !["limit", "host", "hosts", "skills", "kind", "server_search", "cursor"].includes(key)) ||
    new Set(keys).size !== keys.length || query.has("host") && query.has("hosts")) fail("invalid_request", 400);
  const limit = query.get("limit"), options: HistoryOptions = { limit: limit === null ? 25 : Number(limit) };
  if (limit !== null && !/^(?:[1-9]|[1-4][0-9]|50)$/.test(limit)) fail("invalid_request", 400);
  const host = query.get("host"), hosts = query.get("hosts"), skills = query.get("skills"), kind = query.get("kind");
  if (host !== null) options.host = uuid(host);
  if (hosts !== null) {
    const values = hosts.split(",");
    if (values.length > 50 || new Set(values).size !== values.length) fail("invalid_request", 400);
    options.hosts = values.map(uuid).sort();
  }
  if (skills !== null) {
    const values = skills.split(",");
    if (values.length > 100 || new Set(values).size !== values.length ||
      values.some((value) => !historyKeys.includes(value as HistoryKey) && !isPackageSkillId(value))) fail("invalid_request", 400);
    options.skills = (values as HistoryKey[]).sort();
  }
  if (kind !== null) {
    if (!["state", "gap", "context"].includes(kind)) fail("invalid_request", 400);
    options.kind = kind as HistoryKind;
  }
  if (query.has("server_search")) {
    const value = query.get("server_search")!;
    if (value.length > 80 || [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) fail("invalid_request", 400);
    options.search = value.trim();
  }
  const cursor = query.get("cursor");
  if (cursor !== null) {
    if (cursor.length > 256 || !/^[A-Za-z0-9_-]+$/.test(cursor)) fail("invalid_request", 400);
    let decoded: unknown;
    try {
      const bytes = Buffer.from(cursor, "base64url");
      if (bytes.toString("base64url") !== cursor) fail("invalid_request", 400);
      decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch { fail("invalid_request", 400); }
    if (!Array.isArray(decoded) || decoded.length !== 3 || decoded[0] !== filterIdentity(options) || typeof decoded[1] !== "string" ||
      !Number.isFinite(new Date(decoded[1]).getTime()) || new Date(decoded[1]).toISOString() !== decoded[1]) fail("invalid_request", 400);
    options.after = { at: new Date(decoded[1]), id: uuid(decoded[2]) };
  }
  return options;
}
