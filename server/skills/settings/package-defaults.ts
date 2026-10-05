import { authorize, completeAuthorization } from "../../access/session";
import { fail } from "../../errors";
import { uuid } from "../../validation";
import { installed, packageLock, mutationReplay, recordMutation, commandFingerprint,
  settingsTuple, nextCounter, authorizedReplay, type PackageDb } from "../catalog/package-commands";
import { parsedSettings, effectiveSettings, validateSettings, sameSettings } from "./package-validation";

export async function updatePackageDefaults(db: PackageDb, cookie: string, rawId: string,
  input: { request_id: string; expected_revision: string; settings: unknown }, clock: () => Date, store?: string) {
  const id = uuid(rawId), request = uuid(input.request_id), settings = parsedSettings(input.settings);
  const fp = commandFingerprint("defaults", id, input.expected_revision, settingsTuple(settings));
  const saved = await authorizedReplay(db, cookie, request, fp, clock);
  if (saved) return saved;
  const { installation, artifact } = await installed(db, id);
  if (installation.settings_revision !== input.expected_revision) fail("settings_conflict", 409);
  const policies = await db.selectFrom("host_skill_policies").selectAll().where("installation_id", "=", id)
    .orderBy("host_id").limit(501).execute();
  if (policies.length > 500) fail("temporarily_unavailable", 503);
  await validateSettings(artifact.metadata, artifact.official, settings, store);
  const checked = new Set<string>();
  for (const policy of policies) {
    const effective = effectiveSettings(settings, policy.overrides), tuple = JSON.stringify(settingsTuple(effective));
    if (!checked.has(tuple)) {
      await validateSettings(artifact.metadata, artifact.official, effective, store); checked.add(tuple);
    }
  }
  return db.transaction().execute(async (trx) => {
    await packageLock(trx);
    const actor = await authorize(trx, cookie, clock);
    const replay = await mutationReplay(trx, actor.operatorId, request, fp);
    if (replay) return replay;
    const current = await trx.selectFrom("skill_installations").selectAll().where("id", "=", id).forUpdate().executeTakeFirst();
    const currentPolicies = await trx.selectFrom("host_skill_policies").select(["host_id", "version"])
      .where("installation_id", "=", id).orderBy("host_id").limit(501).execute();
    if (!current || current.content_sha256 !== artifact.content_sha256 || current.settings_revision !== input.expected_revision ||
      JSON.stringify(currentPolicies) !== JSON.stringify(policies.map(({ host_id, version }) => ({ host_id, version })))) fail("settings_conflict", 409);
    const changed = !sameSettings(current.defaults, settings), revision = changed ? nextCounter(current.settings_revision) : current.settings_revision;
    if (changed) {
      await trx.insertInto("skill_settings_revisions").values({ installation_id: id, revision,
        content_sha256: artifact.content_sha256, settings, operator_id: actor.operatorId, created_at: actor.at }).execute();
      await trx.updateTable("skill_installations").set({ defaults: settings, settings_revision: revision, updated_at: actor.at }).where("id", "=", id).execute();
    }
    const result = { installation_id: id, settings_revision: revision, settings, changed };
    await completeAuthorization(trx, actor, clock());
    await recordMutation(trx, actor.operatorId, request, "defaults", id, fp, actor.at, result);
    return result;
  });
}
