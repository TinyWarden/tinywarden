import type { Kysely, Transaction } from "kysely";
import type { Database } from "../../db/types";
import type { HistoryKey, HistoryState } from "../../db/history-types";
import type { PackageAssessment } from "../../../lib/skills/package-types";
import type { HistoryFacts } from "../../history/types";
import { packageText } from "../../../lib/skills/package-types";
import { contactState } from "../../fleet/contact";
import { authorize, completeAuthorization } from "../../access/session";
import { uuid } from "../../validation";
import { fail } from "../../errors";
import messages from "../../../messages/en.json";
import { packageRead } from "../catalog/package-commands";

export interface PackageHistoryFacts {
  content_sha256: string; name: string; reason: string; observation_id: string | null;
}
export async function packageProjections(trx: Transaction<Database>, hostIds: string[], at: Date) {
  if (!hostIds.length) return [];
  const installations = await trx.selectFrom("skill_installations as i").innerJoin("skill_packages as p", "p.content_sha256", "i.content_sha256")
    .selectAll("i").select(["p.metadata", "p.official"]).orderBy("i.created_at").orderBy("i.id").limit(100).execute();
  if (!installations.length) return [];
  const agents = await trx.selectFrom("agents").selectAll().where("host_id", "in", hostIds).execute();
  const credentials = await trx.selectFrom("agent_credentials as c").innerJoin("agents as a", "a.id", "c.agent_id")
    .selectAll("c").where("a.host_id", "in", hostIds).whereRef("c.generation", "=", "a.current_generation").execute();
  const runtimes = await trx.selectFrom("skill_runtime_hosts").selectAll().where("host_id", "in", hostIds).execute();
  const policies = await trx.selectFrom("host_skill_policies").selectAll().where("host_id", "in", hostIds).execute();
  const states = await trx.selectFrom("skill_states").selectAll().where("host_id", "in", hostIds).execute();
  const ids = states.map((s) => s.observation_id);
  const observations = ids.length ? await trx.selectFrom("skill_observations").selectAll().where("id", "in", ids).execute() : [];
  const assignmentIds = observations.map((o) => o.assignment_id);
  const assignments = assignmentIds.length ? await trx.selectFrom("skill_assignments").selectAll().where("id", "in", assignmentIds).execute() : [];
  return hostIds.flatMap((hostId) => installations.map((installation) => {
    const agent = agents.find((a) => a.host_id === hostId), credential = credentials.find((c) => c.agent_id === agent?.id);
    const runtime = runtimes.find((r) => r.agent_id === agent?.id && r.generation === agent?.current_generation);
    const eligible = !!agent && !!credential && !agent.revoked_at && !credential.revoked_at;
    const contact = contactState(agent?.revoked_at ?? null, credential?.accepted_at ?? null, agent?.stale_after_seconds ?? 0, at);
    const policy = policies.find((p) => p.host_id === hostId && p.installation_id === installation.id);
    const stored = states.find((s) => s.agent_id === agent?.id && s.installation_id === installation.id);
    const observation = observations.find((o) => o.id === stored?.observation_id);
    const assignment = assignments.find((a) => a.id === observation?.assignment_id);
    const matches = eligible && stored?.generation === agent!.current_generation &&
      stored.content_sha256 === installation.content_sha256 && stored.enablement_version === installation.enablement_version &&
      assignment?.settings_revision === installation.settings_revision && assignment.policy_version === (policy?.version ?? "0");
    let state: HistoryState = "unknown", reason = "awaiting_reading", assessment: PackageAssessment | null = null;
    let validUntil: string | null = null;
    if (!installation.enabled) { state = "disabled"; reason = "disabled"; }
    else if (!eligible || contact !== "current") reason = "contact_unavailable";
    else if (!runtime?.ready) reason = "runtime_unavailable";
    else if (matches && observation) {
      if (observation.finished_at > at || observation.received_at > at) reason = "clock_invalid";
      else if (observation.evidence_expires_at <= at || at.getTime() - observation.received_at.getTime() >= 90 * 86400000) { state = "stale"; reason = "reading_expired"; }
      else if (observation.outcome !== "observed") reason = observation.outcome;
      else {
        assessment = observation.assessments.filter((entry) => entry.from <= at.getTime()).at(-1) ?? null;
        if (assessment) { state = assessment.status; reason = "skill_assessment"; }
        const next = observation.assessments.find((entry) => entry.from > at.getTime());
        validUntil = new Date(Math.min(observation.evidence_expires_at.getTime(), next?.from ?? Infinity)).toISOString();
      }
    }
    const name = packageText(installation.metadata.catalog, { key: installation.metadata.manifest.name_key, params: {} });
    const explanation = assessment ? packageText(installation.metadata.catalog, assessment.reason) :
      (messages.packageSkills.errors as Record<string,string>)[reason] ?? (reason==="disabled"?messages.dashboard.states.disabled:messages.packageSkills.unknown);
    const facts: HistoryFacts = { ...(matches && observation ? { measured_at: observation.finished_at.toISOString() } : {}), package: { content_sha256: installation.content_sha256, name, reason: explanation,
      observation_id: matches && observation ? observation.id : null } satisfies PackageHistoryFacts };
    return { host_id: hostId, installation_id: installation.id, key: installation.subject_key as HistoryKey,
      package_lane: !!runtime, content_sha256: installation.content_sha256, name, reason_text: explanation,
      agent_id: agent?.id ?? null, generation: agent?.current_generation ?? null,
      state, reason, as_of: at.toISOString(), valid_until: validUntil, assessment,
      metadata: installation.metadata, defaults: installation.defaults, overrides: policy?.overrides ?? {}, official: installation.official,
      enabled: installation.enabled, enablement_version: installation.enablement_version,
      source_revision: installation.settings_revision, policy_version: policy?.version ?? "0", assessment_version: 4,
      eligible: eligible && installation.enabled, current_assignment_id: matches ? assignment?.id ?? null : null,
      contact_current: contact === "current", facts, suspend: installation.enabled && contact !== "current" };
  }));
}
export type PackageProjection = Awaited<ReturnType<typeof packageProjections>>[number];
export async function readPackageResults(db: Kysely<Database>, cookie: string, rawHostId: string, clock: () => Date) {
  const hostId = uuid(rawHostId);
  return packageRead(db,async (trx) => {
    const actor = await authorize(trx, cookie, clock);
    if (!await trx.selectFrom("hosts").select("id").where("id", "=", hostId).executeTakeFirst()) fail("not_found", 404);
    const skills = await packageProjections(trx, [hostId], actor.at);
    const readings = await trx.selectFrom("skill_observations").selectAll().where("host_id", "=", hostId)
      .where("received_at", ">=", new Date(actor.at.getTime() - 90 * 86400000)).orderBy("received_at", "desc").orderBy("id", "desc").limit(100).execute();
    const digests = [...new Set(readings.map((r) => r.content_sha256))];
    const catalogs = digests.length ? await trx.selectFrom("skill_packages").select(["content_sha256", "metadata"]).where("content_sha256", "in", digests).execute() : [];
    await completeAuthorization(trx, actor, clock());
    return { as_of: actor.at.toISOString(), host_id: hostId, skills, readings, catalogs };
  });
}
