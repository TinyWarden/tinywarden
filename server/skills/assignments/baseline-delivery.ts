import { exactObject, fingerprint, uuid } from "../../validation";
import { fail } from "../../errors";
import { baselineKeys, type BaselineKey, type BaselineObservation, type Condition } from "../legacy/shared/types";
import { baselineCapability, boundedInteger, type Recipe } from "../legacy/shared/recipe";

export type KnownBaseline = { id: string; revision: number; digest: string };
export type BaselineFetch = { agentVersion: string; capabilities: string[];
  known: { definition_key: BaselineKey; known: KnownBaseline | null }[] };
export type BaselineAssignment = { definition_revision: number; policy_version: number; mode: string;
  applicability: string; normalizer: string; evaluator: string; interval_seconds: number;
  timeout_seconds: number; stale_after_seconds: number; recipe: Recipe };
export type BaselineDelivery = { definition_key: BaselineKey; assignment_id: string; revision: number;
  digest: string; not_modified: boolean; assignment?: BaselineAssignment };

export function baselineFetchInput(raw: Record<string, unknown>): BaselineFetch {
  if (typeof raw.agent_version !== "string" || !/^[a-zA-Z0-9.+-]{1,40}$/.test(raw.agent_version) ||
    !Array.isArray(raw.capabilities) || raw.capabilities.length > 16 ||
    raw.capabilities.some((v) => typeof v !== "string" || !/^[a-zA-Z0-9._-]{1,64}$/.test(v)) ||
    new Set(raw.capabilities).size !== raw.capabilities.length || !Array.isArray(raw.known_assignments) ||
    raw.known_assignments.length !== baselineKeys.length) fail("invalid_request", 400);
  const known = raw.known_assignments.map((v, i) => {
    const row = exactObject(v, ["definition_key", "known"]);
    const key = baselineKeys[i]!;
    if (row.definition_key !== key) fail("invalid_request", 400);
    if (row.known === null) return { definition_key: key, known: null };
    const k = exactObject(row.known, ["id", "revision", "digest"]);
    if (typeof k.digest !== "string" || !/^[a-f0-9]{64}$/.test(k.digest)) fail("invalid_request", 400);
    return { definition_key: key, known: { id: uuid(k.id), revision: boundedInteger(k.revision, 1), digest: k.digest } };
  });
  return { agentVersion: raw.agent_version, capabilities: raw.capabilities as string[], known };
}
export function recipeTuple(r: Recipe) {
  return [r.schema_version, r.capability, r.policy_version, r.timeout_seconds,
    r.steps.map((s) => [s.step_id, s.profile, s.argv])];
}
export function baselineAssignmentDigest(host: string, agent: string, generation: number,
  key: BaselineKey, id: string, revision: number, a: BaselineAssignment): Buffer {
  return fingerprint([1, host, agent, generation, key, id, revision, a.definition_revision, a.policy_version,
    a.mode, a.applicability, baselineCapability, a.normalizer, a.evaluator, a.interval_seconds,
    a.timeout_seconds, a.stale_after_seconds, recipeTuple(a.recipe)]);
}
export function observationTuple(o: BaselineObservation): unknown[] {
  const condition = (c: Condition) => [c.passed, c.checked_at];
  const p = o.packages, r = o.reboot, f = o.fstrim;
  return [o.schema_version, o.key, o.normalizer, o.problem,
    o.execution.map((e) => [e.step_id, e.profile, e.outcome, e.exit_code, e.signal,
      e.stdout_truncated, e.stderr_truncated, e.cleanup_complete]),
    p ? [p.mode, p.upgraded, p.installed, p.removed, p.held_back, p.index_freshness, p.state_consistency] : null,
    r ? [r.marker_observed, r.assurance] : null,
    f ? [[f.timer.load_state, f.timer.active_state, f.timer.unit_file_state, f.timer.last_trigger, f.timer.next_elapse, condition(f.timer.condition)],
      [f.service.load_state, f.service.active_state, f.service.result, f.service.exit_kind, f.service.exit_status,
        f.service.started_at, f.service.finished_at, condition(f.service.condition)], f.observed_at, f.reclamation_verified] : null];
}
