import { retentionCutoff } from "./retention-policy";
import { ms } from "../validation";
import type { Transaction } from "kysely";
import type { Database } from "../db/types";
import type { BaselineSnapshots } from "../db/baseline-types";
import { fail } from "../errors";
import { baselineKeys, type Assessment, type BaselineKey } from "./baseline-types";
import { baselineValues } from "./baseline-recipe";
import { evaluateBaseline } from "./baseline-evaluation";
import { parseBaselineObservation } from "./baseline-values";
import { lockBaselineDefinitions, resolveBaseline } from "./baseline-locks";

export type BaselineHistory = { run_id: string; sequence: number; assignment_id: string;
  started_at: string; finished_at: string; received_at: string; dropped_runs: number;
  definition_revision: number; policy_version: number; mode: string; normalizer: string;
  evaluator: string; recipe: unknown; values: ReturnType<typeof baselineValues>;
  observation: ReturnType<typeof parseBaselineObservation>; assessment: Assessment };
type RunRow = { id: string; host_id: string; agent_id: string; generation: string; definition_key: string;
  run_sequence: string; assignment_id: string; started_at: Date; finished_at: Date; received_at: Date;
  dropped_runs: string; observation: unknown; request_digest: Buffer };
type SnapshotRow = { [K in keyof BaselineSnapshots]: K extends "created_at" ? Date :
  K extends "generation" | "revision" | "definition_revision" | "policy_version" ? string : BaselineSnapshots[K] };
function history(key: BaselineKey, r: RunRow, s: SnapshotRow): BaselineHistory {
  return { run_id: r.id, sequence: Number(r.run_sequence), assignment_id: r.assignment_id,
    started_at: r.started_at.toISOString(), finished_at: r.finished_at.toISOString(), received_at: r.received_at.toISOString(),
    dropped_runs: Number(r.dropped_runs), definition_revision: Number(s.definition_revision), policy_version: Number(s.policy_version),
    mode: s.mode, normalizer: s.normalizer, evaluator: s.evaluator, recipe: s.recipe, values: baselineValues(key, s),
    observation: parseBaselineObservation(r.observation), assessment: evaluateBaseline(r.observation, s.evaluator) };
}
export async function captureBaselineHealth(trx: Transaction<Database>, hostId: string,
  clock: () => Date, includeHistory = true) {
    const definitions = await lockBaselineDefinitions(trx);
    const host = await trx.selectFrom("hosts").selectAll().where("id", "=", hostId).forShare().executeTakeFirst();
    if (!host) fail("not_found", 404);
    const agent = await trx.selectFrom("agents").selectAll().where("host_id", "=", hostId).forShare().executeTakeFirst();
    const credential = agent ? await trx.selectFrom("agent_credentials").selectAll().where("agent_id", "=", agent.id)
      .where("generation", "=", agent.current_generation).forShare().executeTakeFirst() : null;
    const recovery = agent ? await trx.selectFrom("baseline_recovery_latches").select("reason").where("agent_id", "=", agent.id)
      .where("generation", "=", agent.current_generation).executeTakeFirst() : null;
    const now = ms(clock()), cutoff = retentionCutoff(now);
    const captures = [];
    const scopes: { revision: string; policy: string }[] = [];
    for (const key of baselineKeys) {
      const head = await trx.selectFrom("baseline_policies").selectAll().where("host_id", "=", hostId)
        .where("definition_key", "=", key).forShare().executeTakeFirst();
      const policy = head ? await trx.selectFrom("baseline_policy_revisions").selectAll().where("host_id", "=", hostId)
        .where("definition_key", "=", key).where("version", "=", head.current_policy_version).executeTakeFirst() : null;
      if (head && !policy) fail("temporarily_unavailable", 503);
      const definition = definitions.find((d) => d.key === key)!;
      const desired = await resolveBaseline(trx, key, definition.current, policy ?? null);
      const snapshot = await trx.selectFrom("baseline_snapshots").selectAll().where("host_id", "=", hostId)
        .where("definition_key", "=", key).orderBy("revision", "desc").limit(1).executeTakeFirst();
      const recent = includeHistory ? await trx.selectFrom("baseline_runs").selectAll().where("host_id", "=", hostId).where("definition_key", "=", key).where("received_at", ">=", cutoff)
        .orderBy("received_at", "desc").orderBy("id", "desc").limit(5).execute() : [];
      const latest = agent ? await trx.selectFrom("baseline_runs").selectAll().where("host_id", "=", hostId)
        .where("definition_key", "=", key).where("agent_id", "=", agent.id).where("generation", "=", agent.current_generation)
        .orderBy("run_sequence", "desc").limit(1).executeTakeFirst() : null;
      const retired = agent ? await trx.selectFrom("baseline_run_receipts").select(["run_sequence", "assignment_id"])
        .where("agent_id", "=", agent.id).where("generation", "=", agent.current_generation)
        .where("definition_key", "=", key).orderBy("run_sequence", "desc").limit(1).executeTakeFirst() : null;
      const retiredNewest = !!(retired && (!latest || BigInt(retired.run_sequence) >= BigInt(latest.run_sequence)));
      const expired = retiredNewest || !!(latest && latest.received_at < cutoff);
      const latestAssignment = retiredNewest ? retired!.assignment_id : latest?.assignment_id;
      const retained = expired ? null : latest;
      const ids = [...new Set([...recent.map((r) => r.assignment_id), ...(retained ? [retained.assignment_id] : [])])];
      const sources = ids.length ? await trx.selectFrom("baseline_snapshots").selectAll().where("id", "in", ids).execute() : [];
      const map = new Map(sources.map((s) => [s.id, s]));
      const immutable = recent.map((r) => history(key, r, map.get(r.assignment_id)!));
      const newest = retained ? history(key, retained, map.get(retained.assignment_id)!) : null;
      scopes.push({ revision: desired.source.revision, policy: head?.current_policy_version ?? "0" });
      captures.push({ key, head, policy, definition, desired, snapshot, latest: retained, expired, latestAssignment, immutable, newest });
    }
    const checks = captures.map((c) => {
      let state: "healthy" | "warning" | "unknown" | "stale" = "unknown";
      let reason: string;
      if (recovery) reason = "baseline_recovery_required";
      else if (!agent || !credential || agent.revoked_at || credential.revoked_at || !credential.accepted_at ||
        now < credential.accepted_at || now.getTime() - credential.accepted_at.getTime() >= agent.stale_after_seconds * 1000) reason = "contact_unavailable";
      else if (now < c.definition.current.created_at || now < c.desired.source.created_at || c.policy && now < c.policy.created_at) reason = "server_clock_uncertain";
      else if (!c.snapshot || c.snapshot.agent_id !== agent.id || c.snapshot.generation !== agent.current_generation) reason = "no_assignment";
      else if (c.snapshot.definition_revision !== c.desired.source.revision || c.snapshot.policy_version !== (c.head?.current_policy_version ?? "0")) reason = "assignment_obsolete";
      else if (c.snapshot.applicability !== "ready") reason = c.snapshot.applicability;
      else if (c.latestAssignment && c.latestAssignment !== c.snapshot.id) reason = "assignment_obsolete";
      else if (!c.latest || !c.newest) reason = c.expired ? "history_expired" : "no_observation";
      else if (now < c.latest.received_at || now < c.snapshot.created_at) reason = "server_clock_uncertain";
      else if (c.latest.finished_at.getTime() - c.latest.received_at.getTime() > 30_000 || c.latest.started_at.getTime() - c.latest.received_at.getTime() > 30_000) reason = "agent_clock_uncertain";
      else if (now.getTime() - Math.min(c.latest.finished_at.getTime(), c.latest.received_at.getTime()) >= 3 * c.snapshot.interval_seconds * 1000) { state = "stale"; reason = "observation_stale"; }
      else { state = c.newest.assessment.state; reason = c.newest.assessment.reason; }
      const validUntil = (state === "healthy" || state === "warning") && credential?.accepted_at && c.latest && c.snapshot
        ? new Date(Math.min(credential.accepted_at.getTime() + agent!.stale_after_seconds * 1000,
          Math.min(c.latest.finished_at.getTime(), c.latest.received_at.getTime()) + 3 * c.snapshot.interval_seconds * 1000)).toISOString() : null;
      return { definition_key: c.key, state, reason, valid_until: validUntil, current_assignment_id: c.snapshot?.id ?? null,
        latest: c.newest, history: c.immutable };
    });
    return { view: { host_id: hostId, as_of: now.toISOString(), checks },
      summaries: checks.map((check, i) => ({ host_id: hostId, agent_id: agent?.id ?? null,
        generation: agent?.current_generation ?? null, key: check.definition_key,
        source_revision: scopes[i]!.revision, policy_version: scopes[i]!.policy,
        eligible: !!agent && !!credential && !agent.revoked_at && !credential.revoked_at,
        state: check.state, reason: check.reason, as_of: now.toISOString(), valid_until: check.valid_until,
        current_assignment_id: check.current_assignment_id })) };
}
