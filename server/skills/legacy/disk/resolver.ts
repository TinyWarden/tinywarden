import type { Transaction, Selectable } from "kysely";
import type { Database, CheckDefinitionRevisions, HostCheckPolicyRevisions } from "../../../db/types";
import { diskFields, fullOverride, savedOverrides } from "../../settings/field-overrides";
import { key, values } from "./values";

export async function resolveDisk(trx: Transaction<Database>, defaults: Selectable<CheckDefinitionRevisions>,
  policy: Selectable<HostCheckPolicyRevisions> | null) {
  const source = fullOverride(diskFields, policy) ? await trx.selectFrom("check_definition_revisions").selectAll()
    .where("definition_key", "=", key).where("revision", "=", policy!.pinned_definition_revision!).executeTakeFirstOrThrow() : defaults;
  const overrides = savedOverrides(diskFields, policy, policy);
  const effective = values({ ...source, ...overrides });
  return { source, values: effective, overrides: Object.fromEntries(diskFields.filter((f) => Object.hasOwn(overrides, f)).map((f) => [f, effective[f]])) };
}
