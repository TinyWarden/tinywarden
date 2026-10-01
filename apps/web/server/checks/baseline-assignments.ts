import { randomUUID } from "node:crypto";
import type { Kysely, Transaction } from "kysely";
import type { Database } from "../db/types";
import { authorizeAgent } from "../fleet/agent-authority";
import { fail } from "../errors";
import { baselineKeys, type BaselineKey } from "./baseline-types";
import { baselineCapability } from "./baseline-recipe";
import { lockBaselineDefinitions, lockBaselinePolicy, resolveBaseline } from "./baseline-locks";
import { baselineAssignmentDigest, type BaselineAssignment, type BaselineDelivery, type BaselineFetch } from "./baseline-delivery";

export async function latchBaselineRecovery(trx: Transaction<Database>, host: string, agent: string,
  generation: string, reason: "assignment_revision_regressed" | "assignment_identity_conflict" | "assignment_snapshot_missing", now: Date) {
  await trx.insertInto("baseline_recovery_latches").values({ host_id: host, agent_id: agent,
    generation, reason, latched_at: now }).onConflict((c) => c.columns(["agent_id", "generation"]).doNothing()).execute();
}
export async function fetchBaselineAssignments(db: Kysely<Database>, credential: string, input: BaselineFetch, clock: () => Date) {
  const result = await db.transaction().execute(async (trx) => {
    const definitions = await lockBaselineDefinitions(trx);
    const { host, agent, now } = await authorizeAgent(trx, credential, clock);
    if (await trx.selectFrom("baseline_recovery_latches").select("reason").where("agent_id", "=", agent.id)
      .where("generation", "=", agent.current_generation).executeTakeFirst()) return { rejection: "assignment_recovery_required" };
    for (const hint of input.known) {
      if (!hint.known) continue;
      const retained = await trx.selectFrom("baseline_snapshots").selectAll().where("host_id", "=", host.id)
        .where("definition_key", "=", hint.definition_key).where("revision", "=", String(hint.known.revision)).executeTakeFirst();
      const missing = !retained || retained.agent_id !== agent.id || retained.generation !== agent.current_generation;
      const changed = retained && (retained.id !== hint.known.id || retained.payload_digest.toString("hex") !== hint.known.digest);
      if (missing || changed) {
        await latchBaselineRecovery(trx, host.id, agent.id, agent.current_generation,
          missing ? "assignment_revision_regressed" : "assignment_identity_conflict", now);
        return { rejection: missing ? "assignment_revision_regressed" : "assignment_recovery_required" };
      }
    }
    const assignments: BaselineDelivery[] = [];
    const applicability = host.os_id !== "debian" || !/^13(?:\.|$)/.test(host.os_version) ? "unsupported_os"
      : host.architecture !== "amd64" ? "unsupported_architecture" : !input.capabilities.includes(baselineCapability) ? "missing_capability" : "ready";
    for (const key of baselineKeys) {
      const defaults = definitions.find((r) => r.key === key)!;
      const policy = await lockBaselinePolicy(trx, host.id, key, now);
      const resolved = await resolveBaseline(trx, key, defaults.current, policy.current);
      if (now < defaults.current.created_at || now < resolved.source.created_at || now < policy.current.created_at) fail("temporarily_unavailable", 503);
      const last = await trx.selectFrom("baseline_snapshots").selectAll().where("host_id", "=", host.id)
        .where("definition_key", "=", key).orderBy("revision", "desc").limit(1).executeTakeFirst();
      if (last?.agent_id === agent.id && last.generation === agent.current_generation &&
        last.revision !== policy.head.last_delivery_revision) {
        await latchBaselineRecovery(trx, host.id, agent.id, agent.current_generation, "assignment_revision_regressed", now);
        return { rejection: "assignment_revision_regressed" };
      }
      const a: BaselineAssignment = { definition_revision: Number(resolved.source.revision),
        policy_version: Number(policy.head.current_policy_version), mode: policy.current.mode, applicability,
        normalizer: resolved.normalizer, evaluator: resolved.evaluator, ...resolved.values,
        stale_after_seconds: 3 * resolved.values.interval_seconds, recipe: resolved.recipe };
      // Values and complete recipe are part of equality, independently of immutable revision IDs.
      const same = last?.agent_id === agent.id && last.generation === agent.current_generation &&
        last.definition_revision === resolved.source.revision && last.policy_version === policy.head.current_policy_version &&
        last.mode === a.mode && last.applicability === applicability && last.normalizer === a.normalizer && last.evaluator === a.evaluator &&
        last.interval_seconds === a.interval_seconds && last.timeout_seconds === a.timeout_seconds && last.package_mode === resolved.values.package_mode;
      const previous = Math.max(Number(policy.head.last_delivery_revision), Number(last?.revision ?? 0));
      if (!same && previous >= Number.MAX_SAFE_INTEGER) fail("revision_exhausted", 409);
      const revision = same ? Number(last.revision) : previous + 1, id = same ? last.id : randomUUID();
      const digest = baselineAssignmentDigest(host.id, agent.id, Number(agent.current_generation), key, id, revision, a);
      if (same && !last.payload_digest.equals(digest)) {
        await latchBaselineRecovery(trx, host.id, agent.id, agent.current_generation, "assignment_identity_conflict", now);
        return { rejection: "assignment_recovery_required" };
      }
      if (!same) {
        await trx.insertInto("baseline_snapshots").values({ id, host_id: host.id, agent_id: agent.id,
          generation: agent.current_generation, definition_key: key, revision, definition_revision: resolved.source.revision,
          policy_version: policy.head.current_policy_version, mode: a.mode, applicability,
          normalizer: a.normalizer, evaluator: a.evaluator, ...resolved.values, recipe: resolved.recipe,
          created_at: now, payload_digest: digest }).execute();
        await trx.updateTable("baseline_policies").set({ last_delivery_revision: revision })
          .where("host_id", "=", host.id).where("definition_key", "=", key).execute();
      }
      const hint = input.known.find((k) => k.definition_key === key)?.known;
      const notModified = hint?.id === id && hint.revision === revision && hint.digest === digest.toString("hex");
      // package_mode belongs to editor/source rows; the wire conveys mode through exact recipe argv.
      const wire = { definition_revision: a.definition_revision, policy_version: a.policy_version, mode: a.mode,
        applicability: a.applicability, normalizer: a.normalizer, evaluator: a.evaluator,
        interval_seconds: a.interval_seconds, timeout_seconds: a.timeout_seconds, stale_after_seconds: a.stale_after_seconds, recipe: a.recipe };
      assignments.push({ definition_key: key as BaselineKey, assignment_id: id, revision, digest: digest.toString("hex"),
        not_modified: Boolean(notModified), ...(!notModified ? { assignment: wire } : {}) });
    }
    return { host_id: host.id, agent_id: agent.id, generation: Number(agent.current_generation), poll_interval_seconds: 60, assignments };
  });
  if ("rejection" in result) fail(result.rejection, 409);
  return result;
}
