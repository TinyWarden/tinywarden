import { randomUUID } from "node:crypto";
import type { Kysely, Transaction } from "kysely";
import type { Database } from "../../db/types";
import { authorize, completeAuthorization } from "../../access/session";
import { audit } from "../../access/audit";
import { fail } from "../../errors";
import { fingerprint, uuid } from "../../validation";
import { baselineValues, boundedInteger, makeBaselineRecipe, type BaselineValues } from "../legacy/shared/recipe";
import { type BaselineKey } from "../legacy/shared/types";
import { baselineFields, parseOverrides, overridePairs, sameOverrides, savedOverrides } from "./field-overrides";
import { lockBaselineDefinitions, lockBaselinePolicy, resolveBaseline } from "../legacy/shared/locks";

export type BaselineDefinitionEdit = { requestId: string; expectedRevision: number; values: BaselineValues };
export type BaselinePolicyEdit = { schemaVersion?: 1 | 2; overrides?: Partial<BaselineValues>; requestId: string; expectedPolicyVersion: number; expectedDefaultRevision: number;
  mode: "inherit" | "override"; values: BaselineValues | null };
export function baselineDefinitionInput(key: BaselineKey, raw: Record<string, unknown>): BaselineDefinitionEdit {
  return { requestId: uuid(raw.request_id), expectedRevision: boundedInteger(raw.expected_revision, 1), values: baselineValues(key, raw) };
}
export function baselinePolicyInput(key: BaselineKey, raw: Record<string, unknown>): BaselinePolicyEdit {
  if (raw.schema_version === 2) {
    const overrides = parseOverrides(raw.overrides, baselineFields(key)) as Partial<BaselineValues>;
    return { schemaVersion: 2, requestId: uuid(raw.request_id), expectedPolicyVersion: boundedInteger(raw.expected_policy_version, 0),
      expectedDefaultRevision: boundedInteger(raw.expected_default_revision, 1), overrides,
      mode: Object.keys(overrides).length ? "override" : "inherit", values: null };
  }
  if (raw.mode !== "inherit" && raw.mode !== "override") fail("invalid_request", 400);
  return { schemaVersion: 1, overrides: {}, requestId: uuid(raw.request_id), expectedPolicyVersion: boundedInteger(raw.expected_policy_version, 0),
    expectedDefaultRevision: boundedInteger(raw.expected_default_revision, 1), mode: raw.mode,
    values: raw.mode === "override" ? baselineValues(key, raw) : null };
}
async function receipt(trx: Transaction<Database>, operator: string, id: string, digest: Buffer) {
  const row = await trx.selectFrom("baseline_receipts").selectAll().where("operator_id", "=", operator)
    .where("request_id", "=", id).executeTakeFirst();
  if (!row) return null;
  if (!row.request_fingerprint.equals(digest)) fail("request_conflict", 409);
  return { changed: row.changed, duplicate: true, ...(row.resulting_definition_revision !== null ?
    { revision: Number(row.resulting_definition_revision) } : { policy_version: Number(row.resulting_policy_version) }) };
}
function equal(a: BaselineValues, b: BaselineValues) {
  return a.interval_seconds === b.interval_seconds && a.timeout_seconds === b.timeout_seconds && a.package_mode === b.package_mode;
}
function valuesTuple(v: BaselineValues | null) { return v ? [v.interval_seconds, v.timeout_seconds, v.package_mode] : null; }

export async function readBaselineDefinition(db: Kysely<Database>, cookie: string, key: BaselineKey, clock: () => Date) {
  return db.transaction().execute(async (trx) => {
    const actor = await authorize(trx, cookie, clock);
    const selected = (await lockBaselineDefinitions(trx)).find((r) => r.key === key)!;
    const now = await completeAuthorization(trx, actor, clock());
    if (now < selected.current.created_at) fail("temporarily_unavailable", 503);
    const values = baselineValues(key, selected.current);
    return { definition_key: key, revision: Number(selected.head.current_revision), ...values,
      normalizer: selected.current.normalizer, evaluator: selected.current.evaluator };
  });
}
export async function updateBaselineDefinition(db: Kysely<Database>, cookie: string, key: BaselineKey,
  input: BaselineDefinitionEdit, clock: () => Date, correlationId: string = randomUUID()) {
  return db.transaction().execute(async (trx) => {
    const actor = await authorize(trx, cookie, clock);
    const selected = (await lockBaselineDefinitions(trx, key)).find((r) => r.key === key)!;
    const digest = fingerprint([1, "UpdateBaselineDefinition", key, input.expectedRevision, valuesTuple(input.values)]);
    await completeAuthorization(trx, actor, clock());
    const replay = await receipt(trx, actor.operatorId, input.requestId, digest);
    if (replay) return replay;
    const now = await completeAuthorization(trx, actor, clock());
    if (now < selected.current.created_at) fail("temporarily_unavailable", 503);
    const from = Number(selected.head.current_revision);
    if (from !== input.expectedRevision) fail("revision_conflict", 409);
    const changed = !equal(baselineValues(key, selected.current), input.values), to = changed ? from + 1 : from;
    if (changed) {
      if (from >= Number.MAX_SAFE_INTEGER) fail("revision_exhausted", 409);
      await trx.insertInto("baseline_definition_revisions").values({ definition_key: key, revision: to,
        ...input.values, normalizer: selected.current.normalizer, evaluator: selected.current.evaluator,
        recipe: makeBaselineRecipe(key, input.values), created_at: now }).execute();
      await trx.updateTable("baseline_definitions").set({ current_revision: to }).where("definition_key", "=", key).execute();
      await audit(trx, { action: "baseline.definition_updated", actorKind: "operator", operatorId: actor.operatorId,
        definitionKey: key, fromDefinitionRevision: from, toDefinitionRevision: to, at: now, correlationId });
    }
    await trx.insertInto("baseline_receipts").values({ operator_id: actor.operatorId, request_id: input.requestId,
      root: "UpdateBaselineDefinition", definition_key: key, host_id: null, request_fingerprint: digest, changed,
      resulting_definition_revision: to, resulting_policy_version: null, completed_at: now }).execute();
    return { changed, duplicate: false, revision: to };
  });
}
export async function readBaselinePolicy(db: Kysely<Database>, cookie: string, rawHostId: string,
  key: BaselineKey, clock: () => Date) {
  const hostId = uuid(rawHostId);
  return db.transaction().execute(async (trx) => {
    const actor = await authorize(trx, cookie, clock);
    const definition = (await lockBaselineDefinitions(trx)).find((r) => r.key === key)!;
    if (!await trx.selectFrom("hosts").select("id").where("id", "=", hostId).executeTakeFirst()) fail("not_found", 404);
    const head = await trx.selectFrom("baseline_policies").selectAll().where("host_id", "=", hostId)
      .where("definition_key", "=", key).executeTakeFirst();
    const policy = head ? await trx.selectFrom("baseline_policy_revisions").selectAll().where("host_id", "=", hostId)
      .where("definition_key", "=", key).where("version", "=", head.current_policy_version).executeTakeFirst() : null;
    if (head && !policy) fail("temporarily_unavailable", 503);
    const resolved = await resolveBaseline(trx, key, definition.current, policy ?? null);
    const last = await trx.selectFrom("baseline_snapshots").selectAll().where("host_id", "=", hostId)
      .where("definition_key", "=", key).orderBy("revision", "desc").limit(1).executeTakeFirst();
    const now = await completeAuthorization(trx, actor, clock());
    if (now < definition.current.created_at || now < resolved.source.created_at || policy && now < policy.created_at) fail("temporarily_unavailable", 503);
    return { host_id: hostId, definition_key: key, current_default_revision: Number(definition.head.current_revision),
      default_values: baselineValues(key, definition.current), policy_version: Number(head?.current_policy_version ?? 0),
      mode: policy?.mode ?? "inherit", overrides: resolved.overrides, override_values: policy?.mode === "override" ? resolved.values : null,
      effective_values: resolved.values, pinned_definition_revision: policy?.pinned_definition_revision ? Number(policy.pinned_definition_revision) : null,
      latest_delivered_revision: last ? Number(last.revision) : null, latest_delivered_values: last ? baselineValues(key, last) : null,
      applicability: last?.applicability ?? "unknown" };
  });
}
export async function setBaselinePolicy(db: Kysely<Database>, cookie: string, rawHostId: string, key: BaselineKey,
  input: BaselinePolicyEdit, clock: () => Date, correlationId: string = randomUUID()) {
  const hostId = uuid(rawHostId);
  return db.transaction().execute(async (trx) => {
    const actor = await authorize(trx, cookie, clock);
    const definition = (await lockBaselineDefinitions(trx)).find((r) => r.key === key)!;
    const digest = input.schemaVersion === 2 ? fingerprint([2, "SetBaselinePolicy", key, hostId, input.expectedPolicyVersion,
      input.expectedDefaultRevision, overridePairs(input.overrides!)]) : fingerprint([1, "SetBaselinePolicy", key, hostId, input.expectedPolicyVersion,
      input.expectedDefaultRevision, input.mode, valuesTuple(input.values)]);
    await completeAuthorization(trx, actor, clock());
    const replay = await receipt(trx, actor.operatorId, input.requestId, digest);
    if (replay) return replay;
    if (input.schemaVersion !== 2) fail("client_outdated", 409);
    const host = await trx.selectFrom("hosts").selectAll().where("id", "=", hostId).forUpdate().executeTakeFirst();
    if (!host) fail("not_found", 404);
    const agent = await trx.selectFrom("agents").selectAll().where("host_id", "=", hostId).forUpdate().executeTakeFirst();
    const credential = agent ? await trx.selectFrom("agent_credentials").selectAll().where("agent_id", "=", agent.id)
      .where("generation", "=", agent.current_generation).forUpdate().executeTakeFirst() : null;
    const policy = await lockBaselinePolicy(trx, hostId, key, clock());
    const now = await completeAuthorization(trx, actor, clock());
    if (!agent || !credential || agent.revoked_at || credential.revoked_at) fail("agent_unavailable", 409);
    if (now < definition.current.created_at || now < policy.current.created_at || now < host.created_at ||
      now < agent.enrolled_at || now < credential.created_at) fail("temporarily_unavailable", 503);
    const from = Number(policy.head.current_policy_version);
    if (from !== input.expectedPolicyVersion || Number(definition.head.current_revision) !== input.expectedDefaultRevision) fail("revision_conflict", 409);
    const effective = baselineValues(key, { ...baselineValues(key, definition.current), ...input.overrides });
    const old = savedOverrides(baselineFields(key), policy.current, policy.current.mode === "override" ? baselineValues(key, policy.current) : null);
    const changed = !sameOverrides(input.overrides!, old);
    const to = changed ? from + 1 : from;
    if (changed) {
      if (from >= Number.MAX_SAFE_INTEGER) fail("revision_exhausted", 409);
      await trx.insertInto("baseline_policy_revisions").values({ host_id: hostId, definition_key: key, version: to, mode: input.mode, override_fields: Object.keys(input.overrides!).sort(),
        interval_seconds: input.mode === "override" ? effective.interval_seconds : null, timeout_seconds: input.mode === "override" ? effective.timeout_seconds : null,
        package_mode: input.mode === "override" ? effective.package_mode : null,
        pinned_definition_revision: input.mode === "override" ? definition.head.current_revision : null, created_at: now }).execute();
      await trx.updateTable("baseline_policies").set({ current_policy_version: to }).where("host_id", "=", hostId).where("definition_key", "=", key).execute();
      await audit(trx, { action: "baseline.policy_updated", actorKind: "operator", operatorId: actor.operatorId, hostId,
        definitionKey: key, fromPolicyVersion: from, toPolicyVersion: to, at: now, correlationId });
    }
    await trx.insertInto("baseline_receipts").values({ operator_id: actor.operatorId, request_id: input.requestId, root: "SetBaselinePolicy",
      definition_key: key, host_id: hostId, request_fingerprint: digest, changed, resulting_definition_revision: null,
      resulting_policy_version: to, completed_at: now }).execute();
    return { changed, duplicate: false, policy_version: to };
  });
}
