import { currentAssessmentVersion } from "../legacy/shared/assessment";
import { duplicateRun } from "./receipts";
import type { Kysely } from "kysely";
import type { Database } from "../../db/types";
import { authorizeAgent } from "../../fleet/agent-authority";
import { fail } from "../../errors";
import { fingerprint, uuid } from "../../validation";
import { boundedInteger } from "../legacy/shared/recipe";
import { parseBaselineObservation } from "../legacy/shared/observation";
import type { BaselineObservation } from "../legacy/shared/types";
import { observationTuple } from "../assignments/baseline-delivery";
import { lockBaselineDefinitions } from "../legacy/shared/locks";
import { latchBaselineRecovery } from "../assignments/baseline";
import { captureFstrimContext } from "../legacy/trim/context-store";

export type BaselineRunInput = { run_id: string; run_sequence: number; assignment_id: string;
  started_at: string; finished_at: string; dropped_runs: number; observation: BaselineObservation };
export function baselineInstant(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    value.startsWith("0000-") || !Number.isFinite(new Date(value).getTime()) || new Date(value).toISOString() !== value) fail("invalid_request", 400);
  return value;
}
export function baselineRunInput(raw: Record<string, unknown>): BaselineRunInput {
  const observation = parseBaselineObservation(raw.observation);
  if (!observation) fail("invalid_request", 400);
  const start = baselineInstant(raw.started_at), finish = baselineInstant(raw.finished_at);
  if (start > finish || observation.fstrim && observation.fstrim.observed_at !== Math.floor(new Date(finish).getTime() / 1000)) fail("invalid_request", 400);
  return { run_id: uuid(raw.run_id), run_sequence: boundedInteger(raw.run_sequence, 1), assignment_id: uuid(raw.assignment_id),
    started_at: start, finished_at: finish, dropped_runs: boundedInteger(raw.dropped_runs, 0), observation };
}
export function baselineRunDigest(r: BaselineRunInput): Buffer {
  return fingerprint([1, r.run_id, r.run_sequence, r.assignment_id, r.started_at, r.finished_at, r.dropped_runs, observationTuple(r.observation)]);
}
export async function acceptBaselineRun(db: Kysely<Database>, credential: string, input: BaselineRunInput, clock: () => Date) {
  const digest = baselineRunDigest(input);
  const result = await db.transaction().execute(async (trx) => {
    await lockBaselineDefinitions(trx);
    const { host, agent, now } = await authorizeAgent(trx, credential, clock);
    const snapshot = await trx.selectFrom("baseline_snapshots").selectAll().where("id", "=", input.assignment_id).executeTakeFirst();
    if (!snapshot) {
      await latchBaselineRecovery(trx, host.id, agent.id, agent.current_generation, "assignment_snapshot_missing", now);
      return { rejection: "assignment_unknown" };
    }
    if (snapshot.host_id !== host.id || snapshot.agent_id !== agent.id || snapshot.generation !== agent.current_generation ||
      snapshot.applicability !== "ready" || snapshot.definition_key !== input.observation.key ||
      snapshot.normalizer !== input.observation.normalizer || now < snapshot.created_at ||
      input.observation.packages && snapshot.package_mode !== input.observation.packages.mode) fail("assignment_unknown", 409);
    const duplicate = await duplicateRun(trx, "baseline", { hostId: host.id,
      agentId: agent.id, generation: agent.current_generation }, input, digest);
    if (duplicate) return duplicate;
    const trimContext = input.observation.key === "fstrim-status" ? await captureFstrimContext(trx,
      { host: host.id, agent: agent.id, generation: agent.current_generation },
      { id: input.run_id, sequence: input.run_sequence, finished: new Date(input.finished_at), received: now, observation: input.observation }) : null;
    await trx.insertInto("baseline_runs").values({ id: input.run_id, host_id: host.id, agent_id: agent.id,
      generation: agent.current_generation, definition_key: snapshot.definition_key, run_sequence: input.run_sequence,
      assignment_id: snapshot.id, started_at: input.started_at, finished_at: input.finished_at, received_at: now,
      dropped_runs: input.dropped_runs, observation: input.observation, request_digest: digest,
      assessment_version: currentAssessmentVersion, fstrim_context: trimContext }).execute();
    return { run_id: input.run_id, run_sequence: input.run_sequence, received_at: now.toISOString(), duplicate: false };
  });
  if ("rejection" in result) fail(result.rejection, 409);
  return result;
}
