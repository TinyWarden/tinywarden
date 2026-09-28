import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, type Kysely } from "kysely";
import { createDb } from "../server/db/client";
import { migrate } from "../server/db/migrate";
import { parseDatabaseUrl } from "../server/config";
import type { Database } from "../server/db/types";
import { initOperator } from "../server/access/operator";
import { issueToken, revokeToken } from "../server/fleet/tokens";
import { revokeAgent } from "../server/fleet/revocation";
import { fingerprint, newCredential } from "../server/validation";

const url = process.env.TW_TEST_DATABASE_URL;
if (url && new URL(parseDatabaseUrl(url, "tinywarden")).pathname !== "/tinywarden_test_p1b") {
  throw new Error("P1.D timing tests require the owned test database");
}
let db: Kysely<Database>;
let operatorId: string;
let ownOperator = false;
let session: ReturnType<typeof newCredential>;
let base: Date;
const hostId = randomUUID();
const agentId = randomUUID();
const credential = newCredential("agent");
const tokenIds = [randomUUID(), randomUUID()];
const correlationIds: string[] = [];

function at(offset: number): Date { return new Date(base.getTime() + offset); }

async function heldUntilExpiry(table: "hosts" | "enrollment_tokens", id: string,
  operation: (clock: () => Date, correlationId: string) => Promise<unknown>,
  finalOffset = 1000, expectedLastSeen?: Date): Promise<void> {
  let unlock!: () => void;
  let locked!: () => void;
  let firstClock!: () => void;
  const release = new Promise<void>((resolve) => { unlock = resolve; });
  const acquired = new Promise<void>((resolve) => { locked = resolve; });
  const started = new Promise<void>((resolve) => { firstClock = resolve; });
  const holder = db.transaction().execute(async (trx) => {
    if (table === "hosts") {
      await trx.selectFrom("hosts").select("id").where("id", "=", id)
        .forUpdate().executeTakeFirstOrThrow();
    } else {
      await trx.selectFrom("enrollment_tokens").select("id").where("id", "=", id)
        .forUpdate().executeTakeFirstOrThrow();
    }
    locked();
    await release;
  });
  await acquired;
  let calls = 0;
  let settled = false;
  const correlationId = randomUUID();
  correlationIds.push(correlationId);
  const result = operation(() => {
    calls++;
    if (calls === 1) firstClock();
    return at(calls === 1 ? 999 : finalOffset);
  }, correlationId).then(() => { settled = true; return null; },
    (error: unknown) => { settled = true; return error; });
  try {
    await started;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(settled).toBe(false);
  } finally {
    unlock();
    await holder;
  }
  expect(await result).toMatchObject({ status: 401, code: "unauthorized" });
  expect(calls).toBeGreaterThanOrEqual(2);
  const activity = await db.selectFrom("operator_sessions").select("last_seen_at")
    .where("id", "=", session.id).executeTakeFirstOrThrow();
  expect(activity.last_seen_at).toEqual(expectedLastSeen ?? base);
  const audit = await db.selectFrom("audit_events").select("id")
    .where("correlation_id", "=", correlationId).execute();
  expect(audit).toHaveLength(0);
}

describe.skipIf(!url)("P1.D effective session time after domain locks", () => {
  beforeAll(async () => {
    db = createDb(url!);
    const { rows } = await sql<{ database_name: string; session_role: string;
      current_role: string; database_owner: string; schema_owner: string }>`
      SELECT current_database() AS database_name, session_user AS session_role,
        current_user AS current_role,
        (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database()) AS database_owner,
        (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'tinywarden') AS schema_owner
    `.execute(db);
    const target = rows[0];
    if (!target || target.database_name !== "tinywarden_test_p1b" ||
        target.session_role !== "tinywarden" || target.current_role !== "tinywarden" ||
        target.database_owner !== "tinywarden" || target.schema_owner !== "tinywarden") {
      throw new Error("P1.D fixture target or owner mismatch");
    }
    await migrate(url!, "tinywarden_test_p1b");
    base = new Date(Math.max(Date.now(), Date.parse("2026-09-29T00:00:00.000Z")));
    let operator = await db.selectFrom("operators").selectAll()
      .where("singleton", "=", true).executeTakeFirst();
    if (!operator) {
      await initOperator(db, "synthetic-session-timing-password", () => at(-60_000));
      ownOperator = true;
      operator = await db.selectFrom("operators").selectAll()
        .where("singleton", "=", true).executeTakeFirstOrThrow();
    }
    operatorId = operator.id;
    base = new Date(Math.max(base.getTime(), operator.created_at.getTime() + 60_000));
    session = newCredential("session");
    await db.insertInto("operator_sessions").values({ id: session.id,
      operator_id: operatorId, secret_digest: session.digest,
      auth_version: operator.auth_version, issued_at: at(-60_000),
      last_seen_at: base, expires_at: at(1000) }).execute();
    await db.insertInto("hosts").values({ id: hostId, label: "timing-host",
      reported_hostname: "timing.example.org", os_id: "debian", os_version: "13",
      architecture: "amd64", enrolled_agent_version: "0.0.1", created_at: at(-60_000) }).execute();
    await db.insertInto("agents").values({ id: agentId, host_id: hostId,
      current_generation: 1, enrolled_at: at(-60_000), revoked_at: null,
      heartbeat_interval_seconds: 60, stale_after_seconds: 180 }).execute();
    await db.insertInto("agent_credentials").values({ id: credential.id, agent_id: agentId,
      generation: 1, secret_digest: credential.digest, created_at: at(-60_000),
      revoked_at: null, last_sequence: 0, last_fingerprint: null,
      accepted_at: null, sent_at: null, agent_version: null }).execute();
    for (const [index, id] of tokenIds.entries()) {
      const value = newCredential("enrollment");
      await db.insertInto("enrollment_tokens").values({ id, secret_digest: value.digest,
        issued_by: operatorId, issuance_request_id: randomUUID(),
        issuance_fingerprint: fingerprint([index]), label: "timing-token",
        target_agent_id: null, expected_generation: null, issued_at: at(-60_000),
        expires_at: at(840_000), revoked_at: index === 1 ? base : null,
        consumed_at: null, consumed_request_id: null, consumed_fingerprint: null,
        consumed_credential_id: null }).execute();
    }
  });
  afterAll(async () => {
    if (!db) return;
    await db.deleteFrom("audit_events").where("correlation_id", "in", correlationIds).execute();
    await db.deleteFrom("enrollment_tokens").where("id", "in", tokenIds).execute();
    await db.deleteFrom("agent_credentials").where("id", "=", credential.id).execute();
    await db.deleteFrom("agents").where("id", "=", agentId).execute();
    await db.deleteFrom("hosts").where("id", "=", hostId).execute();
    if (session) await db.deleteFrom("operator_sessions").where("id", "=", session.id).execute();
    if (ownOperator) {
      await db.deleteFrom("audit_events").where("target_operator_id", "=", operatorId).execute();
      await db.deleteFrom("operators").where("id", "=", operatorId).execute();
    }
    await db.destroy();
  });

  it("denies replacement issuance when the host lock outlives the session", async () => {
    await heldUntilExpiry("hosts", hostId, (clock, correlationId) => issueToken(db, session.value,
      { requestId: randomUUID(), label: "timing-host", targetAgentId: agentId }, clock, correlationId));
    expect(await db.selectFrom("enrollment_tokens").select("id")
      .where("target_agent_id", "=", agentId).execute()).toHaveLength(0);
  });

  it("denies revocation even when the token is already revoked", async () => {
    const idleStart = at(-30 * 60_000 + 1000);
    await db.updateTable("operator_sessions").set({ issued_at: at(-30 * 60_000),
      last_seen_at: idleStart, expires_at: at(8 * 60 * 60_000) })
      .where("id", "=", session.id).execute();
    await heldUntilExpiry("enrollment_tokens", tokenIds[1]!, (clock, correlationId) =>
      revokeToken(db, session.value, tokenIds[1]!, clock, correlationId), 1000, idleStart);
    expect((await db.selectFrom("enrollment_tokens").select("revoked_at")
      .where("id", "=", tokenIds[1]!).executeTakeFirstOrThrow()).revoked_at).toEqual(base);
    await db.updateTable("operator_sessions").set({ issued_at: at(-60_000),
      last_seen_at: base, expires_at: at(1000) }).where("id", "=", session.id).execute();
  });

  it("denies agent revocation when the host lock outlives the session", async () => {
    await heldUntilExpiry("hosts", hostId, (clock, correlationId) =>
      revokeAgent(db, session.value, agentId, clock, correlationId));
    expect((await db.selectFrom("agents").select("revoked_at")
      .where("id", "=", agentId).executeTakeFirstOrThrow()).revoked_at).toBeNull();
  });

  it("rejects a clock that moves backwards after the token lock", async () => {
    await heldUntilExpiry("enrollment_tokens", tokenIds[0]!, (clock, correlationId) =>
      revokeToken(db, session.value, tokenIds[0]!, clock, correlationId), 998);
    expect((await db.selectFrom("enrollment_tokens").select("revoked_at")
      .where("id", "=", tokenIds[0]!).executeTakeFirstOrThrow()).revoked_at).toBeNull();
  });
});
