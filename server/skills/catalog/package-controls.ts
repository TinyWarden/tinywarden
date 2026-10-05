import { authorize, completeAuthorization } from "../../access/session";
import { fail } from "../../errors";
import { uuid } from "../../validation";
import { jsonValue } from "../../db/json";
import { installed, packageLock, mutationReplay, recordMutation, commandFingerprint,
  nextCounter, canonicalText, authorizedReplay, packageRead, type PackageDb } from "./package-commands";

export async function readPackageSkills(db: PackageDb, cookie: string, clock: () => Date) {
  return packageRead(db,async (trx) => {
  const actor = await authorize(trx, cookie, clock);
  const rows = await trx.selectFrom("skill_installations as i").innerJoin("skill_packages as p", "p.content_sha256", "i.content_sha256")
    .select(["i.id", "i.subject_key", "i.content_sha256", "i.enabled", "i.enablement_version", "i.settings_revision",
      "i.defaults", "i.grants", "i.updated_at", "p.metadata", "p.official"])
    .orderBy("i.created_at").orderBy("i.id").limit(100).execute();
  await completeAuthorization(trx, actor, clock());
  return rows;
  });
}
export async function setPackageEnabled(db: PackageDb, cookie: string, rawId: string,
  input: { request_id: string; expected_enablement_version: string; content_sha256: string;
    enabled: boolean; grants: Record<string, unknown>[] }, clock: () => Date) {
  const id = uuid(rawId), request = uuid(input.request_id);
  if (typeof input.enabled !== "boolean" || !Array.isArray(input.grants)) fail("invalid_request", 400);
  const fp = commandFingerprint("enable", id, input.expected_enablement_version, input.content_sha256, input.enabled, input.grants);
  const saved = await authorizedReplay(db, cookie, request, fp, clock);
  if (saved) return saved;
  const { installation, artifact } = await installed(db, id);
  // SDK v1 approves an exact declared grant set. No widening, implicit grant or stale digest approval.
  if (input.content_sha256 !== artifact.content_sha256 || input.enabled &&
    canonicalText(input.grants) !== canonicalText(artifact.metadata.manifest.capabilities)) fail("invalid_request", 400);
  return db.transaction().execute(async (trx) => {
    await packageLock(trx);
    const actor = await authorize(trx, cookie, clock);
    const replay = await mutationReplay(trx, actor.operatorId, request, fp);
    if (replay) return replay;
    const current = await trx.selectFrom("skill_installations").selectAll().where("id", "=", id).forUpdate().executeTakeFirst();
    if (!current || current.content_sha256 !== installation.content_sha256 || current.enablement_version !== input.expected_enablement_version) fail("settings_conflict", 409);
    const changed = current.enabled !== input.enabled || input.enabled && canonicalText(current.grants) !== canonicalText(input.grants);
    const version = changed ? nextCounter(current.enablement_version) : current.enablement_version;
    await trx.updateTable("skill_installations").set({ enabled: input.enabled, enablement_version: version,
      grants: jsonValue(input.enabled ? input.grants : current.grants), updated_at: actor.at }).where("id", "=", id).execute();
    const result = { installation_id: id, enabled: input.enabled, enablement_version: version, changed };
    await completeAuthorization(trx, actor, clock());
    await recordMutation(trx, actor.operatorId, request, "enable", id, fp, actor.at, result);
    return result;
  });
}
