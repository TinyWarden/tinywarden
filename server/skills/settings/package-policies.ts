import { authorize, completeAuthorization } from "../../access/session";
import { fail } from "../../errors";
import { uuid } from "../../validation";
import { installed, packageLock, mutationReplay, recordMutation, commandFingerprint,
  settingsTuple, nextCounter, authorizedReplay, packageRead, type PackageDb } from "../catalog/package-commands";
import { parsedSettings, effectiveSettings, validateSettings, sameSettings } from "./package-validation";

export async function readPackagePolicy(db: PackageDb, cookie: string, rawHost: string, rawId: string, clock: () => Date) {
  const host = uuid(rawHost), id = uuid(rawId);
  return packageRead(db,async (trx) => {
  const actor = await authorize(trx, cookie, clock);
  if (!await trx.selectFrom("hosts").select("id").where("id", "=", host).executeTakeFirst()) fail("not_found", 404);
  const { installation, artifact } = await installed(trx, id);
  const policy = await trx.selectFrom("host_skill_policies").selectAll().where("host_id", "=", host).where("installation_id", "=", id).executeTakeFirst();
  const result = { installation_id: id, host_id: host, defaults_revision: installation.settings_revision,
    policy_version: policy?.version ?? "0", defaults: installation.defaults, overrides: policy?.overrides ?? {},
    effective: effectiveSettings(installation.defaults, policy?.overrides ?? {}), metadata: artifact.metadata };
  await completeAuthorization(trx, actor, clock());
  return result;
  });
}
export async function setPackagePolicy(db: PackageDb, cookie: string, rawHost: string, rawId: string,
  input: { request_id: string; expected_default_revision: string; expected_policy_version: string; overrides: unknown },
  clock: () => Date, store?: string) {
  const host = uuid(rawHost), id = uuid(rawId), request = uuid(input.request_id), overrides = parsedSettings(input.overrides);
  const fp = commandFingerprint("policy", host, id, input.expected_default_revision, input.expected_policy_version, settingsTuple(overrides));
  const saved = await authorizedReplay(db, cookie, request, fp, clock);
  if (saved) return saved;
  const { installation, artifact } = await installed(db, id);
  if (installation.settings_revision !== input.expected_default_revision || Object.keys(overrides).some((key) => !Object.hasOwn(installation.defaults, key))) fail("settings_conflict", 409);
  await validateSettings(artifact.metadata, artifact.official, effectiveSettings(installation.defaults, overrides), store);
  return db.transaction().execute(async (trx) => {
    await packageLock(trx);
    const actor = await authorize(trx, cookie, clock);
    const replay = await mutationReplay(trx, actor.operatorId, request, fp);
    if (replay) return replay;
    const current = await trx.selectFrom("skill_installations").selectAll().where("id", "=", id).forUpdate().executeTakeFirst();
    const hostRow = await trx.selectFrom("hosts").select("id").where("id", "=", host).executeTakeFirst();
    const policy = await trx.selectFrom("host_skill_policies").selectAll().where("host_id", "=", host).where("installation_id", "=", id).forUpdate().executeTakeFirst();
    if (!hostRow) fail("not_found", 404);
    if (!current || current.settings_revision !== input.expected_default_revision || current.content_sha256 !== artifact.content_sha256 ||
      (policy?.version ?? "0") !== input.expected_policy_version) fail("settings_conflict", 409);
    const changed = !sameSettings(policy?.overrides ?? {}, overrides);
    const version = changed ? nextCounter(policy?.version ?? "0") : policy?.version ?? "0";
    if (changed) {
      const values = { host_id: host, installation_id: id, version, overrides, updated_at: actor.at };
      await trx.insertInto("host_skill_policies").values(values).onConflict((oc) => oc.columns(["host_id", "installation_id"]).doUpdateSet(values)).execute();
      await trx.insertInto("host_skill_policy_revisions").values({ ...values, operator_id: actor.operatorId }).execute();
    }
    const result = { installation_id: id, host_id: host, policy_version: version, overrides,
      effective: effectiveSettings(current.defaults, overrides), changed };
    await completeAuthorization(trx, actor, clock());
    await recordMutation(trx, actor.operatorId, request, "policy", id, fp, actor.at, result);
    return result;
  });
}
