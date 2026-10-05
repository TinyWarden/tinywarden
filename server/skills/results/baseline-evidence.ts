import { retentionCutoff } from "./retention-policy";
import { ms } from "../../validation";
import type { Transaction } from "kysely";
import type { Database } from "../../db/types";
import { fail } from "../../errors";
import { baselineKeys } from "../legacy/shared/types";
import { baselineFacts } from "../legacy/shared/facts";
import { baselineRunHistory, projectBaseline } from "../legacy/shared/projection";
import { lockBaselineDefinitions, resolveBaseline } from "../legacy/shared/locks";

export type { BaselineHistory } from "../legacy/shared/projection";
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
    async function capture(key: typeof baselineKeys[number]) {
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
      const immutable = recent.map((r) => baselineRunHistory(key, r, map.get(r.assignment_id)!));
      const newest = retained ? baselineRunHistory(key, retained, map.get(retained.assignment_id)!) : null;
      return { key, head, policy, definition, desired, snapshot, latest: retained, expired, latestAssignment, immutable, newest };
    }
    const captures: Awaited<ReturnType<typeof capture>>[] = [];
    for (const key of baselineKeys) captures.push(await capture(key));
    const checks = captures.map((c) => {
      const projected = projectBaseline({ control: c.definition.head, at: now, agent, credential, recovery: !!recovery,
        definitionCreated: c.definition.current.created_at, sourceCreated: c.desired.source.created_at,
        policyCreated: c.policy?.created_at ?? null, sourceRevision: c.desired.source.revision,
        policyVersion: c.head?.current_policy_version ?? "0", snapshot: c.snapshot,
        latest: c.newest, latestAssignment: c.latestAssignment, expired: c.expired });
      return { definition_key: c.key, ...projected, current_assignment_id: c.definition.head.enabled && c.snapshot?.enablement_version === c.definition.head.enablement_version ? c.snapshot?.id ?? null : null,
        latest: c.snapshot?.definition_revision === c.desired.source.revision && c.snapshot?.policy_version === (c.head?.current_policy_version ?? "0") && c.definition.head.enabled && c.snapshot?.enablement_version === c.definition.head.enablement_version && c.latestAssignment === c.snapshot?.id ? c.newest : null, history: c.immutable };
    });
    return { view: { host_id: hostId, as_of: now.toISOString(), checks },
      summaries: checks.map((check, i) => ({ host_id: hostId, agent_id: agent?.id ?? null,
        generation: agent?.current_generation ?? null, key: check.definition_key, enablement_version: captures[i]!.definition.head.enablement_version,
        source_revision: captures[i]!.desired.source.revision, policy_version: captures[i]!.head?.current_policy_version ?? "0",
        eligible: captures[i]!.definition.head.enabled && !!agent && !!credential && !agent.revoked_at && !credential.revoked_at,
        state: check.state, reason: check.reason, as_of: now.toISOString(), valid_until: check.valid_until,
        current_assignment_id: check.current_assignment_id, contact_current: check.contact_current,
        assessment_version: check.latest?.assessment_version ?? null, facts: baselineFacts(check.latest, now) })) };
}
