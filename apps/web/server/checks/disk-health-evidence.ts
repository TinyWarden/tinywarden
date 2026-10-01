import { retentionCutoff } from "./retention-policy";
import { ms } from "../validation";
import type { Transaction } from "kysely";
import type { Database } from "../db/types";
import { fail } from "../errors";
import { key } from "./values";
import { lockedDefinition } from "./policy";
import type { DiskHealthState, RunHistory } from "./disk-health-types";

// Owning transaction-neutral capture; callers provide their own authority root.
export async function captureDiskHealth(trx: Transaction<Database>, hostId: string,
  clock: () => Date, includeHistory = true) {
    const { head: definition } = await lockedDefinition(trx);
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
      const mounts = includeHistory ? await trx.selectFrom("disk_run_mounts").selectAll()
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
    let state: DiskHealthState = "unknown";
    let reason: string;
    const sourceRevision = policyRevision?.mode === "override"
      ? policyRevision.pinned_definition_revision : definition.current_revision;
    const sourceMatches = snapshot && snapshot.definition_revision === sourceRevision &&
      snapshot.policy_version === (policy?.current_policy_version ?? "0") &&
      snapshot.mode === (policyRevision?.mode ?? "inherit") &&
      snapshot.agent_id === agent?.id && snapshot.generation === agent?.current_generation;
    const latest = currentRun && !expired ? history.find((run) => run.run_id === currentRun.id) ?? null : null;
    if (recovery) {
      reason = "assignment_recovery_required";
    } else if (!agent || agent.revoked_at || !credential || credential.revoked_at ||
        !credential.accepted_at || at < credential.accepted_at ||
        at.getTime() >= credential.accepted_at.getTime() + agent.stale_after_seconds * 1000) {
      reason = "contact_unavailable";
    } else if (!snapshot || !sourceMatches) {
      reason = snapshot ? "assignment_obsolete" : "no_assignment";
    } else if (snapshot.applicability !== "ready") {
      reason = snapshot.applicability;
    } else if (!latest) {
      reason = expired ? "history_expired" : "no_observation";
    } else if (at < new Date(latest.received_at)) {
      reason = "server_clock_uncertain";
    } else if (new Date(latest.finished_at).getTime() >
        new Date(latest.received_at).getTime() + 30000) {
      reason = "agent_clock_uncertain";
    } else if (latest.coverage !== "complete") {
      reason = latest.reason;
    } else {
      const anchor = Math.min(new Date(latest.finished_at).getTime(),
        new Date(latest.received_at).getTime());
      if (at.getTime() - anchor >= 3 * snapshot.interval_seconds * 1000) {
        state = "stale";
        reason = "observation_stale";
      } else if (latest.classification === "unknown") {
        reason = "no_writable_mount";
      } else {
        state = latest.classification as DiskHealthState;
        reason = "none";
      }
    }
    const view = { as_of: at.toISOString(), state, reason,
      current_assignment_id: sourceMatches ? snapshot!.id : null, latest,
      history: history.filter((run) => recent.some((row) => row.id === run.run_id)) };

    const validUntil = ["healthy", "warning", "critical"].includes(state) && latest && snapshot && credential?.accepted_at
      ? new Date(Math.min(credential.accepted_at.getTime() + agent!.stale_after_seconds * 1000,
        Math.min(new Date(latest.finished_at).getTime(), new Date(latest.received_at).getTime()) + 3 * snapshot.interval_seconds * 1000)).toISOString() : null;
    return { view, summary: { host_id: hostId, agent_id: agent?.id ?? null,
      generation: agent?.current_generation ?? null, key: key as "disk-local", source_revision: sourceRevision ?? "0",
      policy_version: policy?.current_policy_version ?? "0", eligible: !!agent && !!credential && !agent.revoked_at && !credential.revoked_at,
      state, reason, as_of: at.toISOString(), valid_until: validUntil, current_assignment_id: view.current_assignment_id } };
}
