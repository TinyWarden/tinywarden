import { fail } from "../../errors";
import { uuid } from "../../validation";
import { baselineInstant } from "./baseline-runs";
import { commandFingerprint } from "../catalog/package-commands";
export const packageOutcomes = ["observed", "runtime_unavailable", "capability_denied", "broker_limit", "output_exceeded",
  "deadline_exceeded", "resource_exhausted", "execution_failed", "output_invalid", "cleanup_failed", "observation_unavailable", "package_rejected"] as const;
export interface PackageRun {
  manual_request_id?:string; protocol_version?:1|2; resources?:unknown; run_id: string; run_sequence: number; assignment_id: string;
  started_at: string; finished_at: string; outcome: typeof packageOutcomes[number]; observation: unknown;
}
export function packageRunInput(raw: Record<string, unknown>): PackageRun {
  const sequence = raw.run_sequence;
  if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 1 ||
    !packageOutcomes.includes(raw.outcome as PackageRun["outcome"]) || raw.outcome !== "observed" && raw.observation !== null) fail("invalid_request", 400);
  const started = baselineInstant(raw.started_at), finished = baselineInstant(raw.finished_at);
  if (started > finished || new Date(finished).getTime() - new Date(started).getTime() > 65000) fail("invalid_request", 400);
  return { ...(raw.schema_version===2?{protocol_version:2 as const,...(raw.resources!==undefined?{resources:raw.resources}:{})}:{}), ...(raw.manual_request_id!==undefined?{manual_request_id:uuid(raw.manual_request_id)}:{}),run_id: uuid(raw.run_id), run_sequence: sequence, assignment_id: uuid(raw.assignment_id),
    started_at: started, finished_at: finished, outcome: raw.outcome as PackageRun["outcome"], observation: raw.observation };
}
export function packageRunDigest(run: PackageRun) {
  if(run.protocol_version===2)return commandFingerprint("run_resources_v1",run.run_id,run.run_sequence,run.assignment_id,run.started_at,run.finished_at,run.outcome,run.observation,run.resources??null,run.manual_request_id??null);
  return commandFingerprint("run", run.run_id, run.run_sequence, run.assignment_id,
    run.started_at, run.finished_at, run.outcome, run.observation,...(run.manual_request_id?[run.manual_request_id]:[]));
}
