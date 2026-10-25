import {packageTransfer,readPackageArchive} from '../runtime/artifact-download';
import { recordAgentContact } from "../../fleet/contact-evidence";
import { authorizeAgent } from "../../fleet/agent-authority";
import { fail } from "../../errors";
import { uuid } from "../../validation";
import { packageLock, type PackageDb } from "../catalog/package-commands";
import { packageStore } from "../runtime/storage";
import { MAX_SKILL_ZIP } from "../catalog/package-upload";
export async function downloadSkill(db: PackageDb, credential: string, rawId: string, clock: () => Date, store = packageStore) {
  const id = uuid(rawId);
  return packageTransfer(async()=>db.transaction().execute(async (trx) => {
    await packageLock(trx);
    const authority = await authorizeAgent(trx, credential, clock);
    const { host, agent, now } = authority;
    const assignment = await trx.selectFrom("skill_assignments").selectAll().where("id", "=", id)
      .where("host_id", "=", host.id).where("agent_id", "=", agent.id).where("generation", "=", agent.current_generation).executeTakeFirst();
    if (!assignment || assignment.valid_until <= now) fail("assignment_unknown", 409);
    const i = await trx.selectFrom("skill_installations").selectAll().where("id", "=", assignment.installation_id).executeTakeFirst();
    const policy = await trx.selectFrom("host_skill_policies").selectAll().where("host_id", "=", host.id).where("installation_id", "=", assignment.installation_id).executeTakeFirst();
    if (!i?.enabled || i.content_sha256 !== assignment.content_sha256 || i.enablement_version !== assignment.enablement_version ||
      i.settings_revision !== assignment.settings_revision || (policy?.version ?? "0") !== assignment.policy_version) fail("assignment_unknown", 409);
    const p = await trx.selectFrom("skill_packages").selectAll().where("content_sha256", "=", i.content_sha256).executeTakeFirstOrThrow();
    const archive = p.metadata.archive;
    if (!archive || !/^[0-9a-f]{64}$/.test(archive.sha256) || archive.size > MAX_SKILL_ZIP) fail("temporarily_unavailable", 503);
    const result=await readPackageArchive(i.content_sha256,archive,store);
    await recordAgentContact(trx,authority);return result;
  }));
}
