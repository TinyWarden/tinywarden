import type { Selectable } from "kysely";
import type { Agents, AgentCredentials } from "../../../db/types";
import type { BaselineRuns, BaselineSnapshots } from "../../../db/baseline-types";
import { assessBaseline } from "./assessment";
import { baselineValues } from "./recipe";
import { parseBaselineObservation } from "./observation";
import type { BaselineKey } from "./types";
import { trimNextTransition } from "../trim/assessment";
import { parseFstrimContext } from "../trim/context";

export function baselineRunHistory(key: BaselineKey, run: Selectable<BaselineRuns>, source: Selectable<BaselineSnapshots>) {
  return { run_id: run.id, sequence: Number(run.run_sequence), assignment_id: run.assignment_id,
    started_at: run.started_at.toISOString(), finished_at: run.finished_at.toISOString(), received_at: run.received_at.toISOString(),
    dropped_runs: Number(run.dropped_runs), definition_revision: Number(source.definition_revision), policy_version: Number(source.policy_version),
    mode: source.mode, normalizer: source.normalizer, evaluator: source.evaluator, assessment_version: run.assessment_version,
    recipe: source.recipe, values: baselineValues(key, source), observation: parseBaselineObservation(run.observation),
    fstrim_context: run.assessment_version === 3 ? parseFstrimContext(run.fstrim_context) : null,
    assessment: assessBaseline(run.observation, source.evaluator, run.assessment_version, run.fstrim_context, run.finished_at) };
}
export type BaselineHistory = ReturnType<typeof baselineRunHistory>;
import type { Control } from "../../catalog/controls";
export interface BaselineProjectionInput {
  control?: Control;
  at: Date; agent: Selectable<Agents> | null | undefined; credential: Selectable<AgentCredentials> | null | undefined;
  recovery: boolean; definitionCreated: Date; sourceCreated: Date; policyCreated: Date | null;
  sourceRevision: string; policyVersion: string; snapshot: Selectable<BaselineSnapshots> | null | undefined;
  latest: BaselineHistory | null; latestAssignment: string | null | undefined; expired: boolean;
}
export function projectBaseline(input: BaselineProjectionInput) {
  const { at, agent, credential, snapshot, latest } = input;
  const contactCurrent = !!agent && !!credential && !agent.revoked_at && !credential.revoked_at &&
    !!credential.accepted_at && at >= credential.accepted_at &&
    at.getTime() < credential.accepted_at.getTime() + agent.stale_after_seconds * 1000;
  if (input.control?.enabled === false) return { state: "disabled" as const, reason: "skill_disabled", valid_until: null, contact_current: contactCurrent };
  let state: "healthy" | "warning" | "unknown" | "stale" = "unknown", reason: string;
  if (input.recovery) reason = "baseline_recovery_required";
  else if (!contactCurrent) reason = "contact_unavailable";
  else if (at < input.definitionCreated || at < input.sourceCreated || input.policyCreated && at < input.policyCreated) reason = "server_clock_uncertain";
  else if (!snapshot || snapshot.agent_id !== agent!.id || snapshot.generation !== agent!.current_generation) reason = "no_assignment";
  else if ((snapshot.enablement_version ?? "1") !== (input.control?.enablement_version ?? "1")) reason = "enablement_changed";
  else if (snapshot.definition_revision !== input.sourceRevision || snapshot.policy_version !== input.policyVersion) reason = "assignment_obsolete";
  else if (snapshot.applicability !== "ready") reason = snapshot.applicability;
  else if (input.latestAssignment && input.latestAssignment !== snapshot.id) reason = "assignment_obsolete";
  else if (!latest) reason = input.expired ? "history_expired" : "no_observation";
  else if (at < new Date(latest.received_at) || at < snapshot.created_at) reason = "server_clock_uncertain";
  else if (new Date(latest.finished_at).getTime() - new Date(latest.received_at).getTime() > 30_000 ||
    new Date(latest.started_at).getTime() - new Date(latest.received_at).getTime() > 30_000) reason = "agent_clock_uncertain";
  else if (at.getTime() - Math.min(new Date(latest.finished_at).getTime(), new Date(latest.received_at).getTime()) >= 3 * snapshot.interval_seconds * 1000) {
    state = "stale"; reason = "observation_stale";
  } else {
    const assessment = latest.assessment_version === 3 ? assessBaseline(latest.observation, latest.evaluator, 3, latest.fstrim_context, at) : latest.assessment;
    state = assessment.state; reason = assessment.reason;
  }
  const validUntil = (state === "healthy" || state === "warning") && credential?.accepted_at && latest && snapshot
    ? new Date(Math.min(credential.accepted_at.getTime() + agent!.stale_after_seconds * 1000,
      Math.min(new Date(latest.finished_at).getTime(), new Date(latest.received_at).getTime()) + 3 * snapshot.interval_seconds * 1000,
      latest.assessment_version === 3 ? trimNextTransition(latest.fstrim_context, at) : Infinity)).toISOString() : null;
  return { state, reason, valid_until: validUntil, contact_current: contactCurrent };
}
