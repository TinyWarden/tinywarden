import type { Selectable, Transaction } from "kysely";
import type { Database, Hosts } from "../../db/types";
import { fail } from "../../errors";
import { contactState } from "../../fleet/contact";
import { baselineKeys } from "../legacy/shared/types";
import { baselineRunHistory, projectBaseline } from "../legacy/shared/projection";
import { projectDisk } from "../legacy/disk/projection";
import type { RunHistory } from "../legacy/disk/health-types";
import { baselineFacts, diskFacts } from "../legacy/shared/facts";
import { retentionCutoff } from "./retention-policy";
import { packageProjections } from "./package-projection";

// One bounded set of queries per batch, all under the caller's MVCC snapshot.
export async function fleetEvidence(trx: Transaction<Database>, hosts: Selectable<Hosts>[], at: Date) {
  if (!hosts.length || hosts.length > 50) throw new Error("invalid_fleet_batch");
  const ids = hosts.map((host) => host.id), cutoff = retentionCutoff(at);
  const packages = await packageProjections(trx, ids, at);
  const agents = await trx.selectFrom("agents").selectAll().where("host_id", "in", ids).execute();
  const credentials = await trx.selectFrom("agent_credentials as c").innerJoin("agents as a", "a.id", "c.agent_id")
    .selectAll("c").where("a.host_id", "in", ids).whereRef("c.generation", "=", "a.current_generation").execute();
  const diskDefinition = await trx.selectFrom("check_definitions").selectAll().where("definition_key", "=", "disk-local").executeTakeFirst();
  const diskDefaults = diskDefinition ? await trx.selectFrom("check_definition_revisions").selectAll()
    .where("definition_key", "=", "disk-local").where("revision", "=", diskDefinition.current_revision).executeTakeFirst() : null;
  const baselineDefinitions = await trx.selectFrom("baseline_definitions").selectAll().execute();
  if (!diskDefinition || !diskDefaults || baselineDefinitions.length !== 3) fail("temporarily_unavailable", 503);
  const diskPolicies = await trx.selectFrom("host_check_policies").selectAll().where("host_id", "in", ids).execute();
  const diskPolicyRevisions = await trx.selectFrom("host_check_policy_revisions as r")
    .innerJoin("host_check_policies as p", (join) => join.onRef("p.host_id", "=", "r.host_id")
      .onRef("p.definition_key", "=", "r.definition_key").onRef("p.current_policy_version", "=", "r.version"))
    .selectAll("r").where("r.host_id", "in", ids).execute();
  const baselinePolicies = await trx.selectFrom("baseline_policies").selectAll().where("host_id", "in", ids).execute();
  const baselinePolicyRevisions = await trx.selectFrom("baseline_policy_revisions as r")
    .innerJoin("baseline_policies as p", (join) => join.onRef("p.host_id", "=", "r.host_id")
      .onRef("p.definition_key", "=", "r.definition_key").onRef("p.current_policy_version", "=", "r.version"))
    .selectAll("r").where("r.host_id", "in", ids).execute();
  const revisionPairs = [...baselineDefinitions.map((head) => ({ key: head.definition_key, revision: head.current_revision })),
    ...baselinePolicyRevisions.filter((policy) => policy.mode === "override").map((policy) => ({
      key: policy.definition_key, revision: policy.pinned_definition_revision! }))];
  const baselineSources = await trx.selectFrom("baseline_definition_revisions").selectAll()
    .where((eb) => eb.or(revisionPairs.map((pair) => eb.and([
      eb("definition_key", "=", pair.key), eb("revision", "=", pair.revision)])))).execute();
  const diskSnapshots = await trx.selectFrom("check_assignment_snapshots").selectAll().where("host_id", "in", ids)
    .distinctOn("host_id").orderBy("host_id").orderBy("revision", "desc").execute();
  const baselineSnapshots = await trx.selectFrom("baseline_snapshots").selectAll().where("host_id", "in", ids)
    .distinctOn(["host_id", "definition_key"]).orderBy("host_id").orderBy("definition_key").orderBy("revision", "desc").execute();
  const baselineRuns = await trx.selectFrom("baseline_runs as r").innerJoin("agents as a", "a.id", "r.agent_id")
    .selectAll("r").where("a.host_id", "in", ids).whereRef("r.generation", "=", "a.current_generation")
    .distinctOn(["r.agent_id", "r.definition_key"]).orderBy("r.agent_id").orderBy("r.definition_key").orderBy("r.run_sequence", "desc").execute();
  const baselineReceipts = await trx.selectFrom("baseline_run_receipts as r").innerJoin("agents as a", "a.id", "r.agent_id")
    .select(["r.agent_id", "r.definition_key", "r.run_sequence", "r.assignment_id"])
    .where("a.host_id", "in", ids).whereRef("r.generation", "=", "a.current_generation")
    .distinctOn(["r.agent_id", "r.definition_key"]).orderBy("r.agent_id").orderBy("r.definition_key").orderBy("r.run_sequence", "desc").execute();
  const sourceIds = [...new Set(baselineRuns.map((run) => run.assignment_id))];
  const runSources = sourceIds.length ? await trx.selectFrom("baseline_snapshots").selectAll().where("id", "in", sourceIds).execute() : [];
  const diskIds = diskSnapshots.map((source) => source.id);
  const diskRuns = diskIds.length ? await trx.selectFrom("disk_runs").selectAll().where("assignment_id", "in", diskIds)
    .distinctOn("assignment_id").orderBy("assignment_id").orderBy("run_sequence", "desc").execute() : [];
  const diskReceipts = diskIds.length ? await trx.selectFrom("disk_run_receipts").select(["assignment_id", "run_sequence"])
    .where("assignment_id", "in", diskIds).distinctOn("assignment_id").orderBy("assignment_id").orderBy("run_sequence", "desc").execute() : [];
  const runIds = diskRuns.filter((run) => run.received_at >= cutoff).map((run) => run.id);
  const mounts = runIds.length ? await trx.selectFrom("disk_run_mounts").selectAll().where("run_id", "in", runIds).execute() : [];
  const diskRecovery = await trx.selectFrom("disk_recovery_latches").selectAll().where("host_id", "in", ids).execute();
  const baselineRecovery = await trx.selectFrom("baseline_recovery_latches").selectAll().where("host_id", "in", ids).execute();
  return hosts.map((host) => {
    const agent = agents.find((row) => row.host_id === host.id), credential = credentials.find((row) => row.agent_id === agent?.id);
    const contactAt = credential?.revoked_at ? null : credential?.accepted_at ?? null;
    const contact = contactState(agent?.revoked_at ?? null, contactAt, agent?.stale_after_seconds ?? 0, at);
    const scope = { host_id: host.id, agent_id: agent?.id ?? null, generation: agent?.current_generation ?? null,
      eligible: !!agent && !!credential && !agent.revoked_at && !credential.revoked_at, as_of: at.toISOString() };
    const contactCheck = { ...scope, key: "contact" as const, state: contact === "current" ? "healthy" as const
      : contact === "stale" ? "offline" as const : "unknown" as const, reason: contact,
      source_revision: "0", policy_version: "0", assessment_version: null, current_assignment_id: null,
      valid_until: contact === "current" ? new Date(contactAt!.getTime() + agent!.stale_after_seconds * 1000).toISOString() : null };
    const snapshot = diskSnapshots.find((row) => row.host_id === host.id);
    const head = diskPolicies.find((row) => row.host_id === host.id);
    const policy = diskPolicyRevisions.find((row) => row.host_id === host.id);
    if (head && !policy) fail("temporarily_unavailable", 503);
    const run = diskRuns.find((row) => row.assignment_id === snapshot?.id);
    const receipt = diskReceipts.find((row) => row.assignment_id === snapshot?.id);
    const expired = !!(receipt && (!run || BigInt(receipt.run_sequence) >= BigInt(run.run_sequence)) || run && run.received_at < cutoff);
    const latest: RunHistory | null = run && snapshot && !expired ? {
      run_id: run.id, sequence: Number(run.run_sequence), assignment_id: run.assignment_id,
      received_at: run.received_at.toISOString(), started_at: run.started_at.toISOString(), finished_at: run.finished_at.toISOString(),
      coverage: run.coverage, reason: run.reason, excluded_kernel: run.excluded_kernel, excluded_remote: run.excluded_remote,
      dropped_runs: Number(run.dropped_runs), classification: run.worst_classification, warning_percent: snapshot.warning_percent,
      critical_percent: snapshot.critical_percent, definition_revision: Number(snapshot.definition_revision),
      policy_version: Number(snapshot.policy_version), mode: snapshot.mode,
      mounts: mounts.filter((mount) => mount.run_id === run.id) } : null;
    const sourceRevision = policy?.mode === "override" ? policy.pinned_definition_revision! : diskDefinition.current_revision;
    const disk = projectDisk({ control: diskDefinition, at, agent, credential, snapshot, latest, expired,
      recovery: diskRecovery.some((row) => row.agent_id === agent?.id && row.generation === agent?.current_generation),
      sourceRevision, policyVersion: head?.current_policy_version ?? "0", mode: policy?.mode ?? "inherit" });
    const diskCheck = { ...scope, ...disk, key: "disk-local" as const, enablement_version: diskDefinition.enablement_version, eligible: scope.eligible && diskDefinition.enabled, source_revision: sourceRevision,
      policy_version: head?.current_policy_version ?? "0", assessment_version: null,
      current_assignment_id: disk.source_matches ? snapshot!.id : null, facts: diskFacts(disk.source_matches && diskDefinition.enabled ? latest : null, disk.worst),
      interval_seconds: policy?.mode === "override" ? policy.interval_seconds! : diskDefaults.interval_seconds };
    const baselines = baselineKeys.map((key) => {
      const definition = baselineDefinitions.find((row) => row.definition_key === key)!;
      const head = baselinePolicies.find((row) => row.host_id === host.id && row.definition_key === key);
      const policy = baselinePolicyRevisions.find((row) => row.host_id === host.id && row.definition_key === key);
      if (head && !policy) fail("temporarily_unavailable", 503);
      const revision = policy?.mode === "override" ? policy.pinned_definition_revision! : definition.current_revision;
      const currentSource = baselineSources.find((row) => row.definition_key === key && row.revision === definition.current_revision);
      const desired = baselineSources.find((row) => row.definition_key === key && row.revision === revision);
      if (!currentSource || !desired) fail("temporarily_unavailable", 503);
      const snapshot = baselineSnapshots.find((row) => row.host_id === host.id && row.definition_key === key);
      const run = baselineRuns.find((row) => row.agent_id === agent?.id && row.definition_key === key);
      const receipt = baselineReceipts.find((row) => row.agent_id === agent?.id && row.definition_key === key);
      const retired = !!(receipt && (!run || BigInt(receipt.run_sequence) >= BigInt(run.run_sequence)));
      const expired = retired || !!(run && run.received_at < cutoff);
      const source = runSources.find((row) => row.id === run?.assignment_id);
      const latest = run && source && !expired ? baselineRunHistory(key, run, source) : null;
      const projected = projectBaseline({ control: definition, at, agent, credential, snapshot, latest, expired,
        recovery: baselineRecovery.some((row) => row.agent_id === agent?.id && row.generation === agent?.current_generation),
        definitionCreated: currentSource.created_at, sourceCreated: desired.created_at, policyCreated: policy?.created_at ?? null,
        sourceRevision: revision, policyVersion: head?.current_policy_version ?? "0",
        latestAssignment: retired ? receipt!.assignment_id : run?.assignment_id });
      const currentSnapshot = definition.enabled && snapshot?.enablement_version === definition.enablement_version;
      const currentReading = currentSnapshot && source?.id === snapshot?.id ? latest : null;
      return { ...scope, ...projected, key, enablement_version: definition.enablement_version, eligible: scope.eligible && definition.enabled, source_revision: revision, policy_version: head?.current_policy_version ?? "0",
        assessment_version: currentReading?.assessment_version ?? null, current_assignment_id: currentSnapshot ? snapshot?.id ?? null : null,
        facts: baselineFacts(currentReading, at), interval_seconds: snapshot?.interval_seconds ?? desired.interval_seconds };
    });
    return { host, agent, credential: credential ? { agent_version: credential.agent_version, accepted_at: contactAt } : null,
      contact, contact_check: contactCheck, disk: diskCheck, baselines, packages: packages.filter((p) => p.host_id === host.id) };
  });
}
export type FleetEvidence = Awaited<ReturnType<typeof fleetEvidence>>[number];
