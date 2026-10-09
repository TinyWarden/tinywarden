import { recordAgentContact } from "../../fleet/contact-evidence";
import {validateManualResult,completeManualResult} from "../manual/agent";
import type { Selectable } from "kysely";
import type { SkillPackageReceipts, SkillStates } from "../../db/package-skill-types";
import { packageLock, canonicalText, type PackageDb } from "../catalog/package-commands";
import { authorizeAgent } from "../../fleet/agent-authority";
import { fail } from "../../errors";
import { sameDigest } from "../../validation";
import { jsonValue } from "../../db/json";
import { runSnapshot, interpretPackage } from "./package-prepare";
import { packageRunDigest, type PackageRun } from "./package-input";
import {captureMetrics} from "../metrics/capture";

function receiptResult(receipt: Selectable<SkillPackageReceipts>) {
  return { run_id: receipt.run_id, run_sequence: Number(receipt.run_sequence),
    received_at: receipt.received_at.toISOString(), current: receipt.current };
}
function stateCursor(state: Selectable<SkillStates> | undefined) {
  return state ? canonicalText([state.generation, state.content_sha256, state.enablement_version,
    state.state_version, state.last_sequence, state.finished_at.toISOString(), state.updated_at.toISOString(), state.state]) : "absent";
}
export async function acceptPackageRun(db: PackageDb, credential: string, input: PackageRun,
  clock: () => Date, store?: string) {
  const digest = packageRunDigest(input), reference = new Date(clock());
  for (let attempt = 0; attempt <= 2; attempt++) {
    const snapshot = await runSnapshot(db, credential, input, digest, clock);
    if ("replay" in snapshot) return receiptResult(snapshot.replay);
    if (snapshot.state && reference < snapshot.state.updated_at) fail("temporarily_unavailable", 503);
    const interpreted = await interpretPackage(snapshot, input, reference, store);
    const result = await db.transaction().execute(async (trx) => {
      await packageLock(trx);
      const scope = await authorizeAgent(trx, credential, clock);
      const replay = await trx.selectFrom("skill_package_receipts").selectAll().where("run_id", "=", input.run_id).executeTakeFirst();
      if (replay) {
        if (replay.agent_id !== scope.agent.id || replay.generation !== scope.agent.current_generation || !sameDigest(replay.request_digest, digest)) fail("idempotency_conflict", 409);
        await recordAgentContact(trx, scope);
        return { receipt: replay };
      }
      const usedSequence = await trx.selectFrom("skill_package_receipts").select("run_id").where("agent_id", "=", scope.agent.id)
        .where("generation", "=", scope.agent.current_generation).where("installation_id", "=", snapshot.installation.id)
        .where("run_sequence", "=", String(input.run_sequence)).executeTakeFirst();
      if (usedSequence) fail("sequence_conflict", 409);
      const assignment = await trx.selectFrom("skill_assignments").selectAll().where("id", "=", input.assignment_id).executeTakeFirst();
      const installation = await trx.selectFrom("skill_installations").selectAll().where("id", "=", snapshot.installation.id).forUpdate().executeTakeFirst();
      const policy = await trx.selectFrom("host_skill_policies").select("version").where("host_id", "=", scope.host.id)
        .where("installation_id", "=", snapshot.installation.id).executeTakeFirst();
      if (!assignment || !installation || !installation.enabled || assignment.valid_until <= scope.now ||
        assignment.agent_id !== scope.agent.id || assignment.host_id !== scope.host.id || assignment.generation !== scope.agent.current_generation ||
        installation.content_sha256 !== assignment.content_sha256 || installation.settings_revision !== assignment.settings_revision ||
        installation.enablement_version !== assignment.enablement_version || (policy?.version ?? "0") !== assignment.policy_version) fail("assignment_unknown", 409);
      await validateManualResult(trx,input,assignment);
      const state = await trx.selectFrom("skill_states").selectAll().where("installation_id", "=", installation.id)
        .where("agent_id", "=", scope.agent.id).forUpdate().executeTakeFirst();
      if (stateCursor(state) !== stateCursor(snapshot.state)) return { retry: true as const };
      await trx.insertInto("skill_observations").values({ id: input.run_id, assignment_id: assignment.id,
        installation_id: installation.id, host_id: scope.host.id, agent_id: scope.agent.id, generation: scope.agent.current_generation,
        content_sha256: assignment.content_sha256, run_sequence: input.run_sequence, started_at: input.started_at,
        finished_at: input.finished_at, received_at: reference, evidence_expires_at: interpreted.expires,
        observation: jsonValue(input.observation), outcome: interpreted.outcome, assessments: jsonValue(interpreted.assessments),
        request_digest: digest, current: interpreted.current }).execute();
      await captureMetrics(trx,{id:input.run_id,host:scope.host.id,installation:installation.id,digest:assignment.content_sha256,
        finished_at:input.finished_at,received_at:reference,current:interpreted.current,outcome:interpreted.outcome,
        assessments:interpreted.assessments,metadata:snapshot.artifact.metadata});
      if (interpreted.current) {
        const values = { installation_id: installation.id, agent_id: scope.agent.id, host_id: scope.host.id,
          generation: scope.agent.current_generation, content_sha256: assignment.content_sha256,
          enablement_version: assignment.enablement_version, state_version: snapshot.artifact.metadata.manifest.state_version,
          last_sequence: String(input.run_sequence), finished_at: new Date(Math.min(new Date(input.finished_at).getTime(), reference.getTime())),
          observation_id: input.run_id, state: jsonValue(interpreted.state), updated_at: reference };
        await trx.insertInto("skill_states").values(values).onConflict((oc) => oc.columns(["installation_id", "agent_id"]).doUpdateSet(values)).execute();
      }
      const receipt = await trx.insertInto("skill_package_receipts").values({ agent_id: scope.agent.id,
        generation: scope.agent.current_generation, installation_id: installation.id, run_sequence: input.run_sequence,
        run_id: input.run_id, assignment_id: assignment.id, request_digest: digest, received_at: reference,
        current: interpreted.current }).returningAll().executeTakeFirstOrThrow();
      await completeManualResult(trx,input,assignment,interpreted.outcome,reference);
      await recordAgentContact(trx, scope);
      return { receipt };
    });
    if ("receipt" in result) return receiptResult(result.receipt);
  }
  fail("temporarily_unavailable", 503);
}
