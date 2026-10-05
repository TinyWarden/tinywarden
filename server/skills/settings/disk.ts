import { randomUUID } from "node:crypto";
import { sql, type Kysely, type Transaction } from "kysely";
import { authorize, completeAuthorization } from "../../access/session";
import { audit } from "../../access/audit";
import type { Clock } from "../../access/operator";
import type { Database, CheckDefinitionRevisions, HostCheckPolicyRevisions } from "../../db/types";
import { fail } from "../../errors";
import { fingerprint, uuid } from "../../validation";
import { resolveDisk } from "../legacy/disk/resolver";
import { diskFields, savedOverrides, overridePairs, sameOverrides } from "./field-overrides";
import { key, values, type Mode, type Values } from "../legacy/disk/values";

type DefinitionEdit = { requestId: string; expectedRevision: number; values: Values };
type PolicyEdit = { schemaVersion?: 1 | 2; overrides?: Partial<Values>; requestId: string; expectedPolicyVersion: number;
  expectedDefaultRevision: number; mode: Mode; values: Values | null };

export async function lockedDefinition(trx: Transaction<Database>, exclusive = false) {
  const query = trx.selectFrom("check_definitions").selectAll().where("definition_key", "=", key);
  const head = await (exclusive ? query.forUpdate() : query.forShare()).executeTakeFirst();
  if (!head) fail("temporarily_unavailable", 503);
  const current = await trx.selectFrom("check_definition_revisions").selectAll()
    .where("definition_key", "=", key).where("revision", "=", head.current_revision)
    .executeTakeFirst();
  if (!current) fail("temporarily_unavailable", 503);
  return { head, current };
}

export function tuple(row: Pick<CheckDefinitionRevisions | HostCheckPolicyRevisions,
  "warning_percent" | "critical_percent" | "interval_seconds">): Values {
  return { warning_percent: row.warning_percent!, critical_percent: row.critical_percent!,
    interval_seconds: row.interval_seconds! };
}
function equal(a: Values, b: Values): boolean {
  return a.warning_percent === b.warning_percent && a.critical_percent === b.critical_percent &&
    a.interval_seconds === b.interval_seconds;
}

export async function lockedPolicy(trx: Transaction<Database>, hostId: string, now: Date) {
  let head = await trx.selectFrom("host_check_policies").selectAll()
    .where("host_id", "=", hostId).where("definition_key", "=", key).forUpdate().executeTakeFirst();
  if (!head) {
    await trx.insertInto("host_check_policies").values({ host_id: hostId, definition_key: key,
      current_policy_version: 0, last_delivery_revision: 0 }).execute();
    await trx.insertInto("host_check_policy_revisions").values({ host_id: hostId,
      definition_key: key, version: 0, mode: "inherit", warning_percent: null,
      critical_percent: null, interval_seconds: null, pinned_definition_revision: null,
      created_at: now }).execute();
    head = await trx.selectFrom("host_check_policies").selectAll()
      .where("host_id", "=", hostId).where("definition_key", "=", key).forUpdate().executeTakeFirstOrThrow();
  }
  const current = await trx.selectFrom("host_check_policy_revisions").selectAll()
    .where("host_id", "=", hostId).where("definition_key", "=", key)
    .where("version", "=", head.current_policy_version).executeTakeFirst();
  if (!current) fail("temporarily_unavailable", 503);
  return { head, current };
}

export async function readDiskDefinition(db: Kysely<Database>, cookie: string, clock: Clock) {
  return db.transaction().execute(async (trx) => {
    const actor = await authorize(trx, cookie, clock);
    const { head, current } = await lockedDefinition(trx);
    const now = await completeAuthorization(trx, actor, clock());
    if (now < current.created_at) fail("temporarily_unavailable", 503);
    return { definition_key: key, kind: "disk_usage", revision: Number(head.current_revision),
      capability: "disk_usage.v1", selector_version: 1, evaluator_version: 1,
      ...tuple(current) };
  });
}

async function receipt(trx: Transaction<Database>, operatorId: string, requestId: string,
  fp: Buffer) {
  const row = await trx.selectFrom("check_mutation_receipts").selectAll()
    .where("operator_id", "=", operatorId).where("request_id", "=", requestId).executeTakeFirst();
  if (!row) return null;
  if (!row.request_fingerprint.equals(fp)) fail("request_conflict", 409);
  return { changed: row.changed, duplicate: true,
    revision: row.resulting_definition_revision === null ? undefined : Number(row.resulting_definition_revision),
    policy_version: row.resulting_policy_version === null ? undefined : Number(row.resulting_policy_version) };
}

export async function updateDiskDefinition(db: Kysely<Database>, cookie: string,
  input: DefinitionEdit, clock: Clock, correlationId: string = randomUUID()) {
  return db.transaction().execute(async (trx) => {
    const actor = await authorize(trx, cookie, clock);
    const { head, current } = await lockedDefinition(trx, true);
    const fp = fingerprint([1, "UpdateDiskDefinition", key, null, input.expectedRevision,
      null, null, null, input.values.warning_percent, input.values.critical_percent,
      input.values.interval_seconds]);
    await completeAuthorization(trx, actor, clock());
    const replay = await receipt(trx, actor.operatorId, input.requestId, fp);
    if (replay) return replay;
    const now = await completeAuthorization(trx, actor, clock());
    if (now < current.created_at) fail("temporarily_unavailable", 503);
    const from = Number(head.current_revision);
    if (from !== input.expectedRevision) fail("revision_conflict", 409);
    const changed = !equal(tuple(current), input.values);
    const to = changed ? from + 1 : from;
    if (changed) {
      const conflict = await sql`SELECT 1 FROM tinywarden.host_check_policies h
        JOIN tinywarden.host_check_policy_revisions p ON p.host_id=h.host_id
          AND p.definition_key=h.definition_key AND p.version=h.current_policy_version
        WHERE h.definition_key='disk-local' AND p.mode='override' AND p.override_fields IS NOT NULL
          AND (CASE WHEN 'warning_percent'=ANY(p.override_fields) THEN p.warning_percent ELSE ${input.values.warning_percent} END)
           >= (CASE WHEN 'critical_percent'=ANY(p.override_fields) THEN p.critical_percent ELSE ${input.values.critical_percent} END)
        LIMIT 1`.execute(trx);
      if (conflict.rows.length) fail("default_override_conflict", 409);
      if (from >= Number.MAX_SAFE_INTEGER) fail("revision_exhausted", 409);
      await trx.insertInto("check_definition_revisions").values({ definition_key: key,
        revision: to, ...input.values, selector_version: 1, evaluator_version: 1,
        created_at: now }).execute();
      await trx.updateTable("check_definitions").set({ current_revision: to })
        .where("definition_key", "=", key).execute();
      await audit(trx, { action: "check.definition_updated", actorKind: "operator",
        operatorId: actor.operatorId, definitionKey: key, fromDefinitionRevision: from,
        toDefinitionRevision: to, at: now, correlationId });
    }
    await trx.insertInto("check_mutation_receipts").values({ operator_id: actor.operatorId,
      request_id: input.requestId, root: "UpdateDiskDefinition", definition_key: key,
      host_id: null, request_fingerprint: fp, changed,
      resulting_definition_revision: to, resulting_policy_version: null, completed_at: now }).execute();
    return { changed, duplicate: false, revision: to };
  });
}

export async function readHostDiskPolicy(db: Kysely<Database>, cookie: string,
  rawId: string, clock: Clock) {
  const id = uuid(rawId);
  return db.transaction().execute(async (trx) => {
    const actor = await authorize(trx, cookie, clock);
    const { head: definition, current: defaults } = await lockedDefinition(trx);
    const host = await trx.selectFrom("hosts").select("id")
      .where("id", "=", id).executeTakeFirst();
    if (!host) { await completeAuthorization(trx, actor, clock()); fail("not_found", 404); }
    const policy = await trx.selectFrom("host_check_policies").selectAll()
      .where("host_id", "=", id).where("definition_key", "=", key).executeTakeFirst();
    const row = policy ? await trx.selectFrom("host_check_policy_revisions").selectAll()
      .where("host_id", "=", id).where("definition_key", "=", key)
      .where("version", "=", policy.current_policy_version).executeTakeFirst() : null;
    if (policy && !row) fail("temporarily_unavailable", 503);
    const snapshot = await trx.selectFrom("check_assignment_snapshots").selectAll()
      .where("host_id", "=", id).where("definition_key", "=", key)
      .orderBy("revision", "desc").limit(1).executeTakeFirst();
    const resolved = await resolveDisk(trx, defaults, row ?? null);
    const now = await completeAuthorization(trx, actor, clock());
    if (now < resolved.source.created_at || now < defaults.created_at || (row && now < row.created_at)) {
      fail("temporarily_unavailable", 503);
    }
    const mode = row?.mode ?? "inherit";
    const override = mode === "override" ? resolved.values : null;
    return { host_id: id, definition_key: key,
      current_default_revision: Number(definition.current_revision),
      default_values: tuple(defaults), policy_version: Number(policy?.current_policy_version ?? 0),
      mode, overrides: resolved.overrides, override_values: override, effective_values: resolved.values,
      pinned_definition_revision: row?.pinned_definition_revision ? Number(row.pinned_definition_revision) : null,
      applicability: snapshot?.applicability ?? "unknown",
      latest_delivered_revision: snapshot ? Number(snapshot.revision) : null,
      latest_delivered_values: snapshot ? tuple(snapshot) : null };
  });
}

export async function setHostDiskPolicy(db: Kysely<Database>, cookie: string,
  rawId: string, input: PolicyEdit, clock: Clock, correlationId: string = randomUUID()) {
  const id = uuid(rawId);
  return db.transaction().execute(async (trx) => {
    const actor = await authorize(trx, cookie, clock);
    const { head: definition, current: defaults } = await lockedDefinition(trx);
    const fp = input.schemaVersion === 2 ? fingerprint([2, "SetHostDiskPolicy", key, id, input.expectedPolicyVersion,
      input.expectedDefaultRevision, overridePairs(input.overrides!)]) : fingerprint([1, "SetHostDiskPolicy", key, id, null,
      input.expectedPolicyVersion, input.expectedDefaultRevision, input.mode,
      input.values?.warning_percent ?? null, input.values?.critical_percent ?? null,
      input.values?.interval_seconds ?? null]);
    await completeAuthorization(trx, actor, clock());
    const replay = await receipt(trx, actor.operatorId, input.requestId, fp);
    if (replay) return replay;
    if (input.schemaVersion !== 2) fail("client_outdated", 409);
    const host = await trx.selectFrom("hosts").select(["id", "created_at"])
      .where("id", "=", id).forUpdate().executeTakeFirst();
    if (!host) { await completeAuthorization(trx, actor, clock()); fail("not_found", 404); }
    const agent = await trx.selectFrom("agents").selectAll()
      .where("host_id", "=", id).forUpdate().executeTakeFirst();
    const credential = agent ? await trx.selectFrom("agent_credentials").selectAll()
      .where("agent_id", "=", agent.id).where("generation", "=", agent.current_generation)
      .forUpdate().executeTakeFirst() : null;
    const policy = await lockedPolicy(trx, id, clock());
    const now = await completeAuthorization(trx, actor, clock());
    if (now < defaults.created_at || now < policy.current.created_at) {
      fail("temporarily_unavailable", 503);
    }
    if (!agent || !credential || agent.revoked_at || credential.revoked_at ||
        credential.generation !== agent.current_generation) fail("agent_unavailable", 409);
    if (now < host.created_at || now < agent.enrolled_at || now < credential.created_at) {
      fail("temporarily_unavailable", 503);
    }
    const from = Number(policy.head.current_policy_version);
    if (from !== input.expectedPolicyVersion ||
        Number(definition.current_revision) !== input.expectedDefaultRevision) {
      fail("revision_conflict", 409);
    }
    const effective = values({ ...tuple(defaults), ...input.overrides });
    const changed = !sameOverrides(input.overrides!, savedOverrides(diskFields, policy.current, tuple(policy.current)));
    const to = changed ? from + 1 : from;
    if (changed) {
      if (from >= Number.MAX_SAFE_INTEGER) fail("revision_exhausted", 409);
      await trx.insertInto("host_check_policy_revisions").values({ host_id: id,
        definition_key: key, version: to, mode: input.mode, override_fields: Object.keys(input.overrides!).sort(),
        warning_percent: input.mode === "override" ? effective.warning_percent : null,
        critical_percent: input.mode === "override" ? effective.critical_percent : null,
        interval_seconds: input.mode === "override" ? effective.interval_seconds : null,
        pinned_definition_revision: input.mode === "override" ? definition.current_revision : null,
        created_at: now }).execute();
      await trx.updateTable("host_check_policies").set({ current_policy_version: to })
        .where("host_id", "=", id).where("definition_key", "=", key).execute();
      await audit(trx, { action: "check.policy_updated", actorKind: "operator",
        operatorId: actor.operatorId, definitionKey: key, hostId: id,
        fromPolicyVersion: from, toPolicyVersion: to, at: now, correlationId });
    }
    await trx.insertInto("check_mutation_receipts").values({ operator_id: actor.operatorId,
      request_id: input.requestId, root: "SetHostDiskPolicy", definition_key: key,
      host_id: id, request_fingerprint: fp, changed,
      resulting_definition_revision: null, resulting_policy_version: to,
      completed_at: now }).execute();
    return { changed, duplicate: false, policy_version: to };
  });
}
