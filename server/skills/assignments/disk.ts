import { controlCapability } from "../catalog/controls";
import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Clock } from "../../access/operator";
import type { Database } from "../../db/types";
import { fail } from "../../errors";
import { fingerprint } from "../../validation";
import { authorizeAgent } from "../../fleet/agent-authority";
import { capability, key } from "../legacy/disk/values";
import { resolveDisk } from "../legacy/disk/resolver";
import { lockedDefinition, lockedPolicy } from "../settings/disk";
import { latchDiskRecovery } from "./recovery";

type Input = { agentVersion: string; capabilities: string[];
  known: { id: string; revision: number; digest: string } | null };

export async function fetchCheckAssignments(db: Kysely<Database>, credential: string,
  input: Input, clock: Clock) {
  const result = await db.transaction().execute(async (trx) => {
    const { head: control, current: defaults } = await lockedDefinition(trx);
    const { host, agent, now } = await authorizeAgent(trx, credential, clock);
    const latched = await trx.selectFrom("disk_recovery_latches").select("reason")
      .where("agent_id", "=", agent.id).where("generation", "=", agent.current_generation)
      .executeTakeFirst();
    if (latched) return { rejection: "assignment_recovery_required" as const };
    const last = await trx.selectFrom("check_assignment_snapshots").selectAll()
      .where("host_id", "=", host.id).where("definition_key", "=", key)
      .orderBy("revision", "desc").limit(1).executeTakeFirst();
    if (input.known) {
      const retained = await trx.selectFrom("check_assignment_snapshots")
        .select(["id", "agent_id", "generation", "payload_digest"])
        .where("host_id", "=", host.id).where("definition_key", "=", key)
        .where("revision", "=", String(input.known.revision)).executeTakeFirst();
      if (!retained || retained.agent_id !== agent.id ||
          retained.generation !== agent.current_generation) {
        await latchDiskRecovery(trx, host.id, agent.id, agent.current_generation,
          "assignment_revision_regressed", now);
        return { rejection: "assignment_revision_regressed" as const };
      }
      if (retained.id !== input.known.id ||
          retained.payload_digest.toString("hex") !== input.known.digest) {
        await latchDiskRecovery(trx, host.id, agent.id, agent.current_generation,
          "assignment_identity_conflict", now);
        return { rejection: "assignment_recovery_required" as const };
      }
    }
    const policy = await lockedPolicy(trx, host.id, now);
    const { source, values: effective } = await resolveDisk(trx, defaults, policy.current);
    if (now < control.enablement_changed_at || now < defaults.created_at || now < source.created_at ||
        now < policy.current.created_at) fail("temporarily_unavailable", 503);
    const applicability = !control.enabled ? input.capabilities.includes(controlCapability) ? "disabled" : "missing_capability" : host.os_id !== "debian" || !/^13(?:\.|$)/.test(host.os_version)
      ? "unsupported_os" : host.architecture !== "amd64"
        ? "unsupported_architecture" : !input.capabilities.includes(capability)
          ? "missing_capability" : "ready";
    const same = last && last.agent_id === agent.id &&
      last.generation === agent.current_generation &&
      last.definition_revision === source.revision &&
      last.policy_version === policy.head.current_policy_version &&
      last.mode === policy.current.mode && last.applicability === applicability &&
      last.enablement_version === control.enablement_version &&
      last.warning_percent === effective.warning_percent &&
      last.critical_percent === effective.critical_percent &&
      last.interval_seconds === effective.interval_seconds &&
      last.selector_version === 1 && last.evaluator_version === 1;
    const revision = same ? Number(last.revision) : Number(policy.head.last_delivery_revision) + 1;
    if (!same && Number(policy.head.last_delivery_revision) >= Number.MAX_SAFE_INTEGER) {
      fail("revision_exhausted", 409);
    }
    const id = same ? last.id : randomUUID();
    const digest = fingerprint([1, host.id, agent.id, Number(agent.current_generation), key,
      revision, Number(source.revision), Number(policy.head.current_policy_version),
      policy.current.mode, applicability, capability, 1, 1, effective.warning_percent,
      effective.critical_percent, effective.interval_seconds, 10, 3 * effective.interval_seconds]);
    if (!same) {
      await trx.insertInto("check_assignment_snapshots").values({ id, host_id: host.id,
        definition_key: key, agent_id: agent.id, generation: agent.current_generation,
        revision, definition_revision: source.revision,
        policy_version: policy.head.current_policy_version, mode: policy.current.mode,
        applicability, enablement_version: control.enablement_version, ...effective, selector_version: 1, evaluator_version: 1,
        created_at: now, payload_digest: digest }).execute();
      await trx.updateTable("host_check_policies").set({ last_delivery_revision: revision })
        .where("host_id", "=", host.id).where("definition_key", "=", key).execute();
    } else if (!last.payload_digest.equals(digest)) {
      await latchDiskRecovery(trx, host.id, agent.id, agent.current_generation,
        "assignment_identity_conflict", now);
      return { rejection: "assignment_recovery_required" as const };
    }
    const notModified = input.known?.id === id && input.known.revision === revision &&
      input.known.digest === digest.toString("hex");
    // Credential remains locked throughout resolution; no heartbeat contact is changed.
    return { host_id: host.id, agent_id: agent.id,
      generation: Number(agent.current_generation), assignment_id: id, revision,
      digest: digest.toString("hex"), not_modified: Boolean(notModified),
      poll_interval_seconds: 60,
      ...(!notModified ? { assignment: { definition_key: key,
        definition_revision: Number(source.revision),
        policy_version: Number(policy.head.current_policy_version), mode: policy.current.mode,
        applicability,
        effective: { capability, selector_version: 1, evaluator_version: 1,
          ...effective, timeout_seconds: 10, stale_after_seconds: 3 * effective.interval_seconds },
        checks: applicability === "ready" ? [{ kind: "disk_usage" }] : [] } } : {}) };
  });
  if ("rejection" in result) fail(result.rejection, 409);
  return result;
}
