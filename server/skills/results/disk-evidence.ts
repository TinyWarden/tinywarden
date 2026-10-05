import { retentionCutoff } from "./retention-policy";
import { ms } from "../../validation";
import type { Transaction } from "kysely";
import type { Database } from "../../db/types";
import { fail } from "../../errors";
import { key } from "../legacy/disk/values";
import { resolveDisk } from "../legacy/disk/resolver";
import { lockedDefinition } from "../settings/disk";
import { diskFacts } from "../legacy/shared/facts";
import { projectDisk } from "../legacy/disk/projection";
import type { RunHistory } from "../legacy/disk/health-types";

// Owning transaction-neutral capture; callers provide their own authority root.
export async function captureDiskHealth(trx: Transaction<Database>, hostId: string,
  clock: () => Date, includeHistory = true) {
    const { head: definition, current: defaults } = await lockedDefinition(trx);
    const host = await trx.selectFrom("hosts").selectAll().where("id", "=", hostId)
      .forShare().executeTakeFirst();
    if (!host) fail("not_found", 404);
    const agent = await trx.selectFrom("agents").selectAll().where("host_id", "=", hostId)
      .forShare().executeTakeFirst();
    const credential = agent ? await trx.selectFrom("agent_credentials").selectAll()
      .where("agent_id", "=", agent.id).where("generation", "=", agent.current_generation)
      .forShare().executeTakeFirst() : null;
    const recovery = agent ? await trx.selectFrom("disk_recovery_latches").select("reason")
      .where("agent_id", "=", agent.id).where("generation", "=", agent.current_generation)
      .forShare().executeTakeFirst() : null;
    const policy = await trx.selectFrom("host_check_policies").selectAll()
      .where("host_id", "=", hostId).where("definition_key", "=", key).executeTakeFirst();
    const policyRevision = policy ? await trx.selectFrom("host_check_policy_revisions").selectAll()
      .where("host_id", "=", hostId).where("definition_key", "=", key)
      .where("version", "=", policy.current_policy_version).executeTakeFirst() : null;
    const snapshot = await trx.selectFrom("check_assignment_snapshots").selectAll()
      .where("host_id", "=", hostId).where("definition_key", "=", key)
      .orderBy("revision", "desc").limit(1).executeTakeFirst();
    const base = trx.selectFrom("disk_runs").innerJoin("check_assignment_snapshots as s",
      "s.id", "disk_runs.assignment_id")
      .select(["disk_runs.id", "disk_runs.run_sequence", "disk_runs.assignment_id",
        "disk_runs.received_at", "disk_runs.started_at", "disk_runs.finished_at",
        "disk_runs.coverage", "disk_runs.reason", "disk_runs.excluded_kernel",
        "disk_runs.excluded_remote", "disk_runs.dropped_runs",
        "disk_runs.worst_classification", "s.warning_percent", "s.critical_percent",
        "s.definition_revision", "s.policy_version", "s.mode"])
      .where("disk_runs.host_id", "=", hostId);
    const at = ms(clock()), cutoff = retentionCutoff(at);
    const recent = includeHistory ? await base.where("disk_runs.received_at", ">=", cutoff)
      .orderBy("disk_runs.received_at", "desc").orderBy("disk_runs.id", "desc")
      .limit(5).execute() : [];
    const currentRun = snapshot ? await base.where("disk_runs.assignment_id", "=", snapshot.id)
      .orderBy("disk_runs.run_sequence", "desc").limit(1).executeTakeFirst() : null;
    const retired = snapshot ? await trx.selectFrom("disk_run_receipts").select(["run_sequence"])
      .where("assignment_id", "=", snapshot.id).orderBy("run_sequence", "desc").limit(1).executeTakeFirst() : null;
    const expired = !!(retired && (!currentRun || BigInt(retired.run_sequence) >= BigInt(currentRun.run_sequence)) ||
      currentRun && currentRun.received_at < cutoff);
    const rows = currentRun && !expired && !recent.some((row) => row.id === currentRun.id)
      ? [currentRun, ...recent] : recent;
    const history: RunHistory[] = [];
    for (const row of rows) {
      const mounts = includeHistory || row.id === currentRun?.id ? await trx.selectFrom("disk_run_mounts").selectAll()
        .where("run_id", "=", row.id).orderBy("mount_id").execute() : [];
      history.push({ run_id: row.id, sequence: Number(row.run_sequence),
        assignment_id: row.assignment_id, received_at: row.received_at.toISOString(),
        started_at: row.started_at.toISOString(), finished_at: row.finished_at.toISOString(),
        coverage: row.coverage, reason: row.reason, excluded_kernel: row.excluded_kernel,
        excluded_remote: row.excluded_remote, dropped_runs: Number(row.dropped_runs),
        classification: row.worst_classification, warning_percent: row.warning_percent,
        critical_percent: row.critical_percent, definition_revision: Number(row.definition_revision),
        policy_version: Number(row.policy_version), mode: row.mode,
        mounts: mounts.map((mount) => ({ mount_id: mount.mount_id,
          mount_path: mount.mount_path, mount_root: mount.mount_root,
          filesystem_type: mount.filesystem_type, kind: mount.kind, writable: mount.writable,
          shared_capacity: mount.shared_capacity, reason: mount.reason,
          total_bytes: mount.total_bytes, free_bytes: mount.free_bytes,
          available_bytes: mount.available_bytes, classification: mount.classification })) });
    }
    const resolved = await resolveDisk(trx, defaults, policyRevision ?? null);
    const sourceRevision = resolved.source.revision;
    const latest = currentRun && !expired ? history.find((run) => run.run_id === currentRun.id) ?? null : null;
    const projected = projectDisk({ control: definition, at, agent, credential, recovery: !!recovery, snapshot,
      sourceRevision: sourceRevision ?? "0", policyVersion: policy?.current_policy_version ?? "0",
      mode: policyRevision?.mode ?? "inherit", latest, expired });
    const { state, reason, source_matches: sourceMatches } = projected;
    const view = { as_of: at.toISOString(), valid_until: projected.valid_until, state, reason,
      current_assignment_id: sourceMatches ? snapshot!.id : null, latest: sourceMatches && definition.enabled ? latest : null,
      history: history.filter((run) => recent.some((row) => row.id === run.run_id)) };

    return { view, summary: { host_id: hostId, agent_id: agent?.id ?? null,
      generation: agent?.current_generation ?? null, key: key as "disk-local", enablement_version: definition.enablement_version, source_revision: sourceRevision ?? "0",
      policy_version: policy?.current_policy_version ?? "0", eligible: definition.enabled && !!agent && !!credential && !agent.revoked_at && !credential.revoked_at,
      state, reason, assessment_version: null, as_of: at.toISOString(), valid_until: projected.valid_until, current_assignment_id: view.current_assignment_id,
      contact_current: projected.contact_current, worst: projected.worst, attention: projected.attention,
      fact_valid_until: projected.fact_valid_until, facts: diskFacts(view.latest, projected.worst) } };
}
