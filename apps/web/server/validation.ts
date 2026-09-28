import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { fail } from "./errors";

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const credentialPattern = /^tw_([sea])_([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;

export function uuid(value: unknown): string {
  if (typeof value !== "string" || !uuidV4.test(value)) fail("invalid_request", 400);
  return value;
}

export function exactObject(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid_request", 400);
  const object = value as Record<string, unknown>;
  if (Object.keys(object).length !== keys.length || keys.some((key) => !(key in object))) {
    fail("invalid_request", 400);
  }
  return object;
}

export function versioned(value: unknown, keys: string[]): Record<string, unknown> {
  const object = exactObject(value, ["schema_version", ...keys]);
  if (object.schema_version !== 1) fail("unsupported_version", 400);
  return object;
}

export function ascii(value: unknown, pattern: RegExp, min: number, max: number): string {
  if (typeof value !== "string" || value.length < min || value.length > max || !pattern.test(value)) {
    fail("invalid_request", 400);
  }
  return value;
}

export function label(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || Array.from(value).length > 100 ||
      /[\p{Cc}\p{Cf}\uD800-\uDFFF]/u.test(value)) fail("invalid_request", 400);
  return value;
}

export function password(value: unknown): string {
  if (typeof value !== "string" || Array.from(value).length < 15 ||
      Array.from(value).length > 128 || Buffer.byteLength(value, "utf8") > 512 ||
      /[\uD800-\uDFFF]/u.test(value)) fail("invalid_request", 400);
  return value;
}

type CredentialKind = "session" | "enrollment" | "agent";
const prefix: Record<CredentialKind, string> = { session: "s", enrollment: "e", agent: "a" };
export function newCredential(kind: CredentialKind): { id: string; value: string; digest: Buffer } {
  const id = randomUUID();
  const value = `tw_${prefix[kind]}_${id}.${randomBytes(32).toString("base64url")}`;
  return { id, value, digest: digestCredential(kind, value) };
}

export function parseCredential(kind: CredentialKind, value: unknown): { id: string; value: string; digest: Buffer } {
  if (typeof value !== "string") fail("unauthorized", 401);
  const match = credentialPattern.exec(value);
  if (!match || match[1] !== prefix[kind] || !match[2] || !match[3] ||
      Buffer.from(match[3], "base64url").length !== 32 ||
      Buffer.from(match[3], "base64url").toString("base64url") !== match[3]) fail("unauthorized", 401);
  return { id: match[2], value, digest: digestCredential(kind, value) };
}

function digestCredential(kind: CredentialKind, value: string): Buffer {
  return createHash("sha256").update(`tinywarden:${kind}:v1\0`).update(value, "utf8").digest();
}

export function fingerprint(values: unknown[]): Buffer {
  return createHash("sha256").update(JSON.stringify(values), "utf8").digest();
}

export function sameDigest(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

export function ms(date: Date): Date { return new Date(Math.trunc(date.getTime())); }
