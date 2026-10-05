import type { Selectable } from "kysely";
import type { PackageContext, PackageAssessment } from "../../../lib/skills/package-types";
import type { SkillStates } from "../../db/package-skill-types";
import { matchesSchema } from "../../../lib/skills/schema-values";
import { packageDirectory } from "../runtime/storage";
import { invokePackage, SkillRuntimeError } from "../runtime/client";
import { authorizeAgent } from "../../fleet/agent-authority";
import { fail } from "../../errors";
import { packageLock, type PackageDb } from "../catalog/package-commands";
import type { PackageRun } from "./package-input";
import { sameDigest } from "../../validation";

export async function runSnapshot(db: PackageDb, credential: string, input: PackageRun, digest: Buffer, clock: () => Date) {
  return db.transaction().execute(async (trx) => {
    await packageLock(trx);
    const scope = await authorizeAgent(trx, credential, clock);
    const replay = await trx.selectFrom("skill_package_receipts").selectAll().where("run_id", "=", input.run_id).executeTakeFirst();
    if (replay) {
      if (replay.agent_id !== scope.agent.id || replay.generation !== scope.agent.current_generation || !sameDigest(replay.request_digest, digest)) fail("idempotency_conflict", 409);
      return { replay };
    }
    const assignment = await trx.selectFrom("skill_assignments").selectAll().where("id", "=", input.assignment_id).executeTakeFirst();
    if (!assignment || assignment.host_id !== scope.host.id || assignment.agent_id !== scope.agent.id ||
      assignment.generation !== scope.agent.current_generation || assignment.valid_until <= scope.now) fail("assignment_unknown", 409);
    const installation = await trx.selectFrom("skill_installations").selectAll().where("id", "=", assignment.installation_id).executeTakeFirst();
    const policy = await trx.selectFrom("host_skill_policies").selectAll().where("host_id", "=", scope.host.id).where("installation_id", "=", assignment.installation_id).executeTakeFirst();
    if (!installation || !installation.enabled || installation.content_sha256 !== assignment.content_sha256 ||
      installation.enablement_version !== assignment.enablement_version || installation.settings_revision !== assignment.settings_revision ||
      (policy?.version ?? "0") !== assignment.policy_version) fail("assignment_unknown", 409);
    const artifact = await trx.selectFrom("skill_packages").selectAll().where("content_sha256", "=", assignment.content_sha256).executeTakeFirstOrThrow();
    const state = await trx.selectFrom("skill_states").selectAll().where("installation_id", "=", assignment.installation_id)
      .where("agent_id", "=", scope.agent.id).executeTakeFirst();
    return { ...scope, assignment, installation, artifact, state };
  });
}
export function sameStateScope(state: Selectable<SkillStates> | undefined, scope: {
  agent: { current_generation: string }; assignment: { content_sha256: string; enablement_version: string }; artifact: { metadata: { manifest: { state_version: number } } } }) {
  return !!state && state.generation === scope.agent.current_generation && state.content_sha256 === scope.assignment.content_sha256 &&
    state.enablement_version === scope.assignment.enablement_version && state.state_version === scope.artifact.metadata.manifest.state_version;
}
export async function interpretPackage(snapshot: Exclude<Awaited<ReturnType<typeof runSnapshot>>, { replay: unknown }>,
  input: PackageRun, now: Date, store?: string) {
  const metadata = snapshot.artifact.metadata, finished = new Date(input.finished_at).getTime();
  const expires = finished + snapshot.assignment.interval_seconds * 3000;
  let outcome: string = input.outcome;
  const prior = sameStateScope(snapshot.state, snapshot) && snapshot.state!.updated_at.getTime() >= now.getTime() - 90 * 86400000 ? snapshot.state : undefined;
  const current = !prior || input.run_sequence > Number(prior.last_sequence) && finished >= prior.finished_at.getTime();
  let state = prior?.state ?? null, assessments: PackageAssessment[] = [];
  if (!current) outcome = "delayed_observation";
  else if (finished > now.getTime() + 5000 || finished < now.getTime() - 90 * 86400000) outcome = "clock_invalid";
  else if (expires <= now.getTime()) outcome = "reading_expired";
  if (input.outcome === "observed" && !matchesSchema(metadata.schemas.observation, input.observation)) fail("invalid_request", 400);
  if (outcome === "observed") {
    const context: PackageContext = { identity: { installation_id: snapshot.installation.id, content_sha256: metadata.content_sha256,
      assignment_id: snapshot.assignment.id, generation: snapshot.agent.current_generation }, settings: snapshot.assignment.settings,
      observation: input.observation, previous_state: prior?.state ?? null, state: null, captured_at: finished,
      received_at: now.getTime(), now: now.getTime(), evidence_expires_at: expires };
    try {
      const directory = packageDirectory(metadata.content_sha256, store);
      state = await invokePackage(directory, metadata.content_sha256, snapshot.artifact.official, "reduce", context);
      assessments = await invokePackage<PackageAssessment[]>(directory, metadata.content_sha256, snapshot.artifact.official, "evaluate", { ...context, state });
    } catch (error) {
      if (!(error instanceof SkillRuntimeError)) throw error;
      if (error.code === "runtime_busy") fail("temporarily_unavailable", 503);
      outcome = error.code; state = prior?.state ?? null; assessments = [];
    }
  }
  return { state, assessments, outcome, current, expires: new Date(expires) };
}
