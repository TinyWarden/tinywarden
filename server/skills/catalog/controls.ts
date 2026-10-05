import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "../../db/types";
import { authorize, completeAuthorization } from "../../access/session";
import { fail } from "../../errors";
import { fingerprint, uuid } from "../../validation";
import { lockedDefinition, tuple } from "../settings/disk";
import { lockBaselineDefinitions } from "../legacy/shared/locks";
import { baselineValues } from "../legacy/shared/recipe";
import { findSkill, skillKeys, type SkillKey } from "../../../lib/skills/catalog";

export { skillKeys };
export type { SkillKey };
export const controlCapability = "skill-control.v1";
export type Control = { enabled: boolean; enablement_version: string };
export function skillKey(value: unknown): SkillKey {
  if (typeof value !== "string" || !skillKeys.includes(value as SkillKey)) fail("not_found", 404);
  return value as SkillKey;
}
export function enablementInput(raw: Record<string, unknown>) {
  if (typeof raw.enabled !== "boolean" || !Number.isSafeInteger(raw.expected_enablement_version) ||
    Number(raw.expected_enablement_version) < 1) fail("invalid_request", 400);
  return { requestId: uuid(raw.request_id), expected: Number(raw.expected_enablement_version), enabled: raw.enabled };
}
export async function readSkills(db: Kysely<Database>, cookie: string, clock: () => Date) {
  return db.transaction().execute(async (trx) => {
    const actor = await authorize(trx, cookie, clock);
    const disk = await lockedDefinition(trx), baselines = await lockBaselineDefinitions(trx);
    const skills = [{ key: "disk-local" as SkillKey, head: disk.head, source: disk.current, values: tuple(disk.current) },
      ...baselines.map((b) => ({ key: b.key, head: b.head, source: b.current, values: baselineValues(b.key, b.current) }))];
    const at = await completeAuthorization(trx, actor, clock());
    if (skills.some((s) => at < s.source.created_at || at < s.head.enablement_changed_at)) fail("temporarily_unavailable", 503);
    return { as_of: at.toISOString(), skills: skills.map((s) => ({ key: s.key, revision: Number(s.head.current_revision),
      saved_at: s.source.created_at.toISOString(), enabled: s.head.enabled,
      enablement_version: Number(s.head.enablement_version), enablement_changed_at: s.head.enablement_changed_at.toISOString(), values: s.values })) };
  });
}
export async function setSkillEnabled(db: Kysely<Database>, cookie: string, key: SkillKey,
  input: ReturnType<typeof enablementInput>, clock: () => Date, correlation: string = randomUUID()) {
  return db.transaction().execute(async (trx) => {
    const actor = await authorize(trx, cookie, clock);
    const definition = findSkill(key)!;
    const head = definition.family === "disk" ? (await lockedDefinition(trx, true)).head
      : (await lockBaselineDefinitions(trx, definition.key)).find((d) => d.key === key)!.head;
    const fp = fingerprint([1, "SetSkillEnabled", key, input.expected, input.enabled]);
    const at = await completeAuthorization(trx, actor, clock());
    const prior = await trx.selectFrom("skill_enablement_receipts").selectAll()
      .where("operator_id", "=", actor.operatorId).where("request_id", "=", input.requestId).executeTakeFirst();
    if (prior) {
      if (!prior.request_fingerprint.equals(fp)) fail("request_conflict", 409);
      return { changed: prior.changed, duplicate: true, enabled: prior.resulting_enabled, enablement_version: Number(prior.resulting_version) };
    }
    if (at < head.enablement_changed_at) fail("temporarily_unavailable", 503);
    const from = Number(head.enablement_version);
    if (from !== input.expected) fail("revision_conflict", 409);
    const changed = head.enabled !== input.enabled, to = changed ? from + 1 : from;
    if (changed) {
      if (from >= Number.MAX_SAFE_INTEGER) fail("revision_exhausted", 409);
      await trx.updateTable(findSkill(key)!.family === "disk" ? "check_definitions" : "baseline_definitions")
        .set({ enabled: input.enabled, enablement_version: to, enablement_changed_at: at }).where("definition_key", "=", key).execute();
    }
    await trx.insertInto("skill_enablement_receipts").values({ operator_id: actor.operatorId, request_id: input.requestId,
      skill_key: key, request_fingerprint: fp, previous_enabled: head.enabled, resulting_enabled: input.enabled,
      previous_version: from, resulting_version: to, changed, completed_at: at, correlation_id: correlation }).execute();
    return { changed, duplicate: false, enabled: input.enabled, enablement_version: to };
  });
}
