import { uuid } from "../../validation";
import { fail } from "../../errors";
import { publishPackage } from "../runtime/storage";
import { runtimeRequest } from "../runtime/client";
import { packageStore } from "../runtime/storage";
import type { PackageMetadata } from "../../../lib/skills/package-types";
import { validateSettings } from "../settings/package-validation";
import { operatorSnapshot, packageLock, commandFingerprint, mutationReplay, recordMutation,
  newInstallationId, type PackageDb } from "./package-commands";
import { authorize, completeAuthorization } from "../../access/session";
import { jsonValue } from "../../db/json";

export async function importSkillDirectory(db: PackageDb, cookie: string,
  input: { request_id: string; directory: string; official?: boolean }, clock: () => Date, store?: string) {
  const request = uuid(input.request_id);
  await operatorSnapshot(db, cookie, clock);
  const metadata = await publishPackage(input.directory, input.official === true, store);
  return admitPackage(db, cookie, request, metadata, input.official === true, clock, store);
}

export async function importSkillArchive(db: PackageDb, cookie: string,
  input: { request_id: string; archive: string; archive_sha256: string }, clock: () => Date, store = packageStore) {
  const request = uuid(input.request_id);
  await operatorSnapshot(db, cookie, clock);
  const metadata = await runtimeRequest<PackageMetadata>({ action: "publish_archive", archive: input.archive,
    archive_sha256: input.archive_sha256, store, official: false });
  return admitPackage(db, cookie, request, metadata, false, clock, store, input.archive_sha256);
}

async function admitPackage(db: PackageDb, cookie: string, request: string, metadata: PackageMetadata,
  official: boolean, clock: () => Date, store?: string, sourceArchive?: string) {
  await validateSettings(metadata, official, metadata.manifest.defaults, store);
  const digest = commandFingerprint("import", metadata.content_sha256, official, ...(sourceArchive ? [sourceArchive] : []));
  return db.transaction().execute(async (trx) => {
    await packageLock(trx);
    const actor = await authorize(trx, cookie, clock);
    const replay = await mutationReplay(trx, actor.operatorId, request, digest);
    if (replay) return replay as { installation_id: string; content_sha256: string; enabled: boolean; selected: boolean };
    const oldVersion = await trx.selectFrom("skill_packages").selectAll().where("skill_id", "=", metadata.manifest.id)
      .where("version", "=", metadata.manifest.version).executeTakeFirst();
    if (oldVersion && oldVersion.content_sha256 !== metadata.content_sha256) fail("package_version_conflict", 409);
    if (!oldVersion) await trx.insertInto("skill_packages").values({ content_sha256: metadata.content_sha256,
      skill_id: metadata.manifest.id, version: metadata.manifest.version, metadata, unpacked_bytes: metadata.size,
      official, imported_at: actor.at }).execute();
    else if (!oldVersion.metadata.archive && metadata.archive) await trx.updateTable("skill_packages")
      .set({ metadata }).where("content_sha256", "=", metadata.content_sha256).execute();
    let installation = await trx.selectFrom("skill_installations").selectAll().where("skill_id", "=", metadata.manifest.id).executeTakeFirst();
    if (!installation) {
      const id = newInstallationId();
      // Official compatibility aliases are metadata, never a community-controlled replacement.
      installation = await trx.insertInto("skill_installations").values({ id, skill_id: metadata.manifest.id,
        subject_key: metadata.manifest.alias ?? metadata.manifest.id, content_sha256: metadata.content_sha256,
        enabled: false, enablement_version: "1", settings_revision: "1", defaults: metadata.manifest.defaults,
        grants: jsonValue([]), created_at: actor.at, updated_at: actor.at }).returningAll().executeTakeFirstOrThrow();
      await trx.insertInto("skill_settings_revisions").values({ installation_id: id, revision: "1",
        content_sha256: metadata.content_sha256, settings: metadata.manifest.defaults,
        operator_id: actor.operatorId, created_at: actor.at }).execute();
    }
    const result = { installation_id: installation.id, content_sha256: metadata.content_sha256,
      enabled: installation.enabled, selected: installation.content_sha256 === metadata.content_sha256 };
    await completeAuthorization(trx, actor, clock());
    await recordMutation(trx, actor.operatorId, request, "import", installation.id, digest, actor.at, result);
    return result;
  });
}
