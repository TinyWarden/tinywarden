import type { Transaction } from "kysely";
import type { Database } from "../db/types";
import { fail } from "../errors";
import { baselineKeys, type BaselineKey } from "./baseline-types";
import { baselineValues, checkedBaselineSource, makeBaselineRecipe } from "./baseline-recipe";

export async function lockBaselineDefinitions(trx: Transaction<Database>, exclusive?: BaselineKey | "all") {
  const rows = [];
  for (const key of [...baselineKeys].sort()) {
    const query = trx.selectFrom("baseline_definitions").selectAll().where("definition_key", "=", key);
    const head = await (key === exclusive || exclusive === "all" ? query.forUpdate() : query.forShare()).executeTakeFirst();
    if (!head) fail("temporarily_unavailable", 503);
    const current = await trx.selectFrom("baseline_definition_revisions").selectAll()
      .where("definition_key", "=", key).where("revision", "=", head.current_revision).executeTakeFirst();
    if (!current) fail("temporarily_unavailable", 503);
    checkedBaselineSource(key, current);
    rows.push({ key, head, current });
  }
  return rows;
}
export async function lockBaselinePolicy(trx: Transaction<Database>, hostId: string, key: BaselineKey, now: Date) {
  let head = await trx.selectFrom("baseline_policies").selectAll().where("host_id", "=", hostId)
    .where("definition_key", "=", key).forUpdate().executeTakeFirst();
  if (!head) {
    await trx.insertInto("baseline_policies").values({ host_id: hostId, definition_key: key,
      current_policy_version: 0, last_delivery_revision: 0 }).execute();
    await trx.insertInto("baseline_policy_revisions").values({ host_id: hostId, definition_key: key,
      version: 0, mode: "inherit", interval_seconds: null, timeout_seconds: null,
      package_mode: null, pinned_definition_revision: null, created_at: now }).execute();
    head = await trx.selectFrom("baseline_policies").selectAll().where("host_id", "=", hostId)
      .where("definition_key", "=", key).forUpdate().executeTakeFirstOrThrow();
  }
  const current = await trx.selectFrom("baseline_policy_revisions").selectAll().where("host_id", "=", hostId)
    .where("definition_key", "=", key).where("version", "=", head.current_policy_version).executeTakeFirst();
  if (!current) fail("temporarily_unavailable", 503);
  return { head, current };
}
export async function resolveBaseline(trx: Transaction<Database>, key: BaselineKey,
  defaults: Awaited<ReturnType<typeof lockBaselineDefinitions>>[number]["current"],
  policy: Awaited<ReturnType<typeof lockBaselinePolicy>>["current"] | null) {
  const source = policy?.mode === "override" ? await trx.selectFrom("baseline_definition_revisions").selectAll()
    .where("definition_key", "=", key).where("revision", "=", policy.pinned_definition_revision!).executeTakeFirstOrThrow() : defaults;
  const checked = checkedBaselineSource(key, source);
  const values = policy?.mode === "override" ? baselineValues(key, policy) : checked;
  return { source, values: { interval_seconds: values.interval_seconds, timeout_seconds: values.timeout_seconds,
    package_mode: values.package_mode }, normalizer: checked.normalizer, evaluator: checked.evaluator,
  recipe: makeBaselineRecipe(key, values) };
}
