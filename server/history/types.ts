import { skillKeys } from "../../lib/skills/catalog";
import type { HistoryKey, HistoryState } from "../db/history-types";
import type { ReadingFacts } from "../skills/legacy/shared/facts";
import type { PackageHistoryFacts } from "../skills/results/package-projection";
export type { HistoryKey, HistoryState };
export interface HistoryScope {
  enablement_version?: string;
  agent_id: string | null; generation: string | null;
  source_revision: string; policy_version: string; assessment_version: number | null;
}
export interface HistoryFacts extends ReadingFacts { contact_at?: string; package?: PackageHistoryFacts }
export interface HistorySample extends HistoryScope {
  host_id: string; key: HistoryKey; state: HistoryState; reason: string; as_of: string;
  facts: HistoryFacts; suspend: boolean;
}
export const historyKeys: HistoryKey[] = ["contact", ...skillKeys];
export const historyContinuityMs = 180000;
export function historyScope(value: HistoryScope): HistoryScope {
  return { enablement_version: value.enablement_version ?? "1", agent_id: value.agent_id, generation: value.generation, source_revision: value.source_revision,
    policy_version: value.policy_version, assessment_version: value.assessment_version };
}
