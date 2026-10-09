import { recordAgentContact } from "../../fleet/contact-evidence";
import { randomUUID } from "node:crypto";
import { authorizeAgent } from "../../fleet/agent-authority";
import { packageLock, type PackageDb } from "../catalog/package-commands";
import { effectiveSettings } from "../settings/package-validation";
import { fail } from "../../errors";
import { jsonValue } from "../../db/json";
import type { SkillSettings } from "../../../lib/skills/package-types";

import {manualDelivery} from "../manual/agent";
import {expireRequests,manualCapability} from "../manual/lifecycle";

interface PackageAssignmentWire {
  installation_id:string;content_sha256:string;subject_key:string;applicability:"ready"|"unavailable";
  manual_request?:{id:string;expires_at:string}|undefined;
  assignment_id?:string;official?:boolean;archive_sha256?:string;archive_bytes?:number;
  settings?:SkillSettings;grants?:Record<string,unknown>[];interval_seconds?:number;
}

export const packageCapability = "skill_packages.python313.v1";
export async function fetchPackageAssignments(db: PackageDb, credential: string,
  ready: boolean, clock: () => Date, capability?:string) {
  if (typeof ready !== "boolean") fail("invalid_request", 400);
  return db.transaction().execute(async (trx) => {
    await packageLock(trx);
    const authority = await authorizeAgent(trx, credential, clock);
    const { host, agent, now } = authority;
    await expireRequests(trx,host.id,now);
    const manual=capability===manualCapability;
    const validUntil = new Date(now.getTime() + 300000);
    const installations = await trx.selectFrom("skill_installations as i")
      .innerJoin("skill_packages as p", "p.content_sha256", "i.content_sha256")
      .select(["i.id", "i.content_sha256", "i.enablement_version", "i.settings_revision", "i.defaults", "i.grants", "i.subject_key",
        "p.metadata", "p.official"])
      .where("i.enabled", "=", true).orderBy("i.id").limit(100).execute();
    const policies = await trx.selectFrom("host_skill_policies").selectAll().where("host_id", "=", host.id).execute();
    const supported = ready && host.os_id === "debian" && host.os_version === "13" && host.architecture === "amd64";
    await trx.insertInto("skill_runtime_hosts").values({ agent_id: agent.id, host_id: host.id,
      generation: agent.current_generation, ready: supported, manual_runs_supported:manual, reported_at: now }).onConflict((oc) => oc.column("agent_id")
      .doUpdateSet({ generation: agent.current_generation, ready: supported, manual_runs_supported:manual, reported_at: now })).execute();
    const result:PackageAssignmentWire[] = [];
    for (const i of installations) {
      const policy = policies.find((p) => p.installation_id === i.id);
      const version = policy?.version ?? "0", settings = effectiveSettings(i.defaults, policy?.overrides ?? {});
      const interval = settings.interval_seconds ?? 300;
      if (typeof interval !== "number" || !Number.isInteger(interval) || interval < 60 || interval > 86400) fail("temporarily_unavailable", 503);
      if (!supported || !i.metadata.manifest.compatibility.architectures.includes(host.architecture)) {
        result.push({ installation_id: i.id, content_sha256: i.content_sha256, subject_key: i.subject_key, applicability: "unavailable" as const });
        continue;
      }
      let assignment = await trx.selectFrom("skill_assignments").selectAll().where("host_id", "=", host.id)
        .where("agent_id", "=", agent.id).where("generation", "=", agent.current_generation)
        .where("installation_id", "=", i.id).where("content_sha256", "=", i.content_sha256)
        .where("enablement_version", "=", i.enablement_version).where("settings_revision", "=", i.settings_revision)
        .where("policy_version", "=", version).orderBy("created_at", "desc").orderBy("id", "desc").executeTakeFirst();
      if (assignment) {
        // Scope/configuration is immutable; only the current authority lease renews.
        await trx.updateTable("skill_assignments").set({ valid_until: validUntil }).where("id", "=", assignment.id).execute();
      } else {
        assignment = await trx.insertInto("skill_assignments").values({ id: randomUUID(), host_id: host.id,
          agent_id: agent.id, generation: agent.current_generation, installation_id: i.id, content_sha256: i.content_sha256,
          enablement_version: i.enablement_version, settings_revision: i.settings_revision, policy_version: version,
          settings, grants: jsonValue(i.grants), interval_seconds: interval, created_at: now, valid_until: validUntil }).returningAll().executeTakeFirstOrThrow();
      }
      result.push({ installation_id: i.id, assignment_id: assignment.id, subject_key: i.subject_key,
        content_sha256: i.content_sha256, official: i.official, applicability: "ready" as const,
        ...(i.metadata.archive ? { archive_sha256: i.metadata.archive.sha256, archive_bytes: i.metadata.archive.size } : {}),
        ...(manual?{manual_request:await manualDelivery(trx,assignment,now)}:{}),
        settings, grants: i.grants, interval_seconds: interval });
    }
    await recordAgentContact(trx, authority);
    return { generation: agent.current_generation, issued_at: now.toISOString(), valid_until: validUntil.toISOString(),
      ...(manual?{manual_runs_supported:true}:{}), runtime_ready: supported, assignments: result };
  });
}
