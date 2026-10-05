import { sql, type Selectable, type Transaction } from "kysely";
import type { Database } from "../../../db/types";
import type { BaselineRuns } from "../../../db/baseline-types";
import { normalizers, evaluators } from "../shared/types";
import { parseBaselineObservation } from "../shared/observation";
import { parseBaselineRecipe } from "../shared/recipe";
import { retentionCutoff } from "../../results/retention-policy";
import { advanceFstrimContext, parseFstrimContext, type TrimSample } from "./context";

type Prior = Selectable<BaselineRuns> & { normalizer: string; evaluator: string; recipe: unknown; source_created: Date };
function supported(row: Prior) {
  try { parseBaselineRecipe("fstrim-status", row.recipe); }
  catch { return false; }
  return row.normalizer === normalizers["fstrim-status"] && row.evaluator === evaluators["fstrim-status"];
}
function sample(row: Prior): TrimSample | null {
  const observation = parseBaselineObservation(row.observation);
  if (row.finished_at.getTime() - row.received_at.getTime() > 30_000 || row.received_at < row.source_created ||
    observation?.fstrim && observation.fstrim.observed_at !== Math.floor(row.finished_at.getTime() / 1000)) return null;
  return { id: row.id, sequence: Number(row.run_sequence), finished: row.finished_at, received: row.received_at, observation };
}
export async function captureFstrimContext(trx: Transaction<Database>, scope: { host: string; agent: string; generation: string },
  current: TrimSample) {
  if (current.finished.getTime() - current.received.getTime() > 30_000) return null;
  const query = () => trx.selectFrom("baseline_runs as r").innerJoin("baseline_snapshots as s", "s.id", "r.assignment_id")
    .selectAll("r").select(["s.normalizer", "s.evaluator", "s.recipe", "s.created_at as source_created"])
    .where("r.host_id", "=", scope.host).where("r.agent_id", "=", scope.agent).where("r.generation", "=", scope.generation)
    .where("r.definition_key", "=", "fstrim-status").where("r.run_sequence", "<", String(current.sequence))
    .where(sql<boolean>`r.finished_at <= r.received_at + interval '30 seconds'`)
    .where("r.received_at", ">=", retentionCutoff(current.received));
  const previous = await query().orderBy("r.run_sequence", "desc").limit(1).executeTakeFirst();
  let context = null;
  if (previous?.assessment_version === 3) {
    if (!supported(previous) || !(context = parseFstrimContext(previous.fstrim_context))) return null;
    const delayed = await query().where("r.run_sequence", "<", previous.run_sequence)
      .where("r.received_at", ">=", previous.received_at).orderBy("r.run_sequence").limit(30_001).execute();
    if (delayed.length > 30_000) return null;
    for (const row of delayed) {
      if (!supported(row)) continue;
      const input = sample(row);
      if (input) context = advanceFstrimContext(context, input, false);
      if (!context) return null;
    }
  } else if (previous) {
    const rows = await query().orderBy("r.run_sequence").limit(30_001).execute();
    if (rows.length > 30_000) return null;
    for (const row of rows) {
      if (!supported(row) || row.assessment_version !== 1 && row.assessment_version !== 2) return null;
      const input = sample(row);
      if (input) {
        context = advanceFstrimContext(context, input);
        if (!context) return null;
      }
    }
  }
  return advanceFstrimContext(context, current);
}
