import type { BaselineHistory } from "./projection";
import type { RunHistory } from "../disk/health-types";
import type { worstDisk } from "../disk/projection";
import { retainedTrimExecution } from "../trim/context";

export interface ReadingFacts {
  run_id?: string; measured_at?: string;
  disk?: NonNullable<ReturnType<typeof worstDisk>> & { coverage: string };
  packages?: { upgraded: number; installed: number; removed: number; held_back: number };
  marker_observed?: boolean;
  trim?: { timer_state: string; service_state: string; result: string; finished_at: number | null;
    last_observed_result?: "success" | "failure" | null; last_observed_at?: number | null;
    next_scheduled_at?: number | null; expected_at?: number | null };
}
export function baselineFacts(run: BaselineHistory | null, at?: Date): ReadingFacts {
  if (!run) return {};
  const observation = run.observation;
  const facts: ReadingFacts = { run_id: run.run_id, measured_at: run.finished_at };
  if (observation?.packages) {
    const { upgraded, installed, removed, held_back } = observation.packages;
    facts.packages = { upgraded, installed, removed, held_back };
  }
  if (observation?.reboot) facts.marker_observed = observation.reboot.marker_observed;
  if (observation?.fstrim) facts.trim = { timer_state: observation.fstrim.timer.active_state,
    service_state: observation.fstrim.service.active_state, result: observation.fstrim.service.result,
    finished_at: observation.fstrim.service.finished_at };
  if (facts.trim && run.assessment_version === 3 && run.fstrim_context) {
    const last = retainedTrimExecution(run.fstrim_context, at ?? new Date(run.finished_at));
    Object.assign(facts.trim, { last_observed_result: last?.outcome ?? null,
      last_observed_at: last?.finished_at ?? last?.observed_at ?? null,
      next_scheduled_at: observation!.fstrim!.timer.next_elapse, expected_at: run.fstrim_context.expected_at });
  }
  return facts;
}
export function diskFacts(run: RunHistory | null, worst: ReturnType<typeof worstDisk>): ReadingFacts {
  return run && worst ? { run_id: run.run_id, measured_at: run.finished_at,
    disk: { ...worst, coverage: run.coverage } } : {};
}
