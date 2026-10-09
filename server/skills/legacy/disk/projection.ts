import { agentContactAt } from "../../../fleet/contact-evidence";
import type { Selectable } from "kysely";
import type { Agents, AgentCredentials, CheckAssignmentSnapshots } from "../../../db/types";
import type { DiskHealthState, RunHistory, MountHistory } from "./health-types";

import type { Control } from "../../catalog/controls";
export interface DiskProjectionInput {
  control?: Control;
  at: Date; agent: Selectable<Agents> | null | undefined; credential: Selectable<AgentCredentials> | null | undefined;
  recovery: boolean; snapshot: Selectable<CheckAssignmentSnapshots> | null | undefined;
  sourceRevision: string; policyVersion: string; mode: string; latest: RunHistory | null; expired: boolean;
}
export function worstDisk(mounts: MountHistory[]) {
  const eligible = mounts.filter((m) => m.kind === "local" && m.writable && m.reason === "none" &&
    m.total_bytes !== null && BigInt(m.total_bytes) > 0n && m.available_bytes !== null &&
    ["healthy", "warning", "critical"].includes(m.classification));
  eligible.sort((a, b) => {
    const left = (BigInt(a.total_bytes!) - BigInt(a.available_bytes!)) * BigInt(b.total_bytes!);
    const right = (BigInt(b.total_bytes!) - BigInt(b.available_bytes!)) * BigInt(a.total_bytes!);
    return left > right ? -1 : left < right ? 1 : a.mount_path < b.mount_path ? -1 : a.mount_path > b.mount_path ? 1 : a.mount_id - b.mount_id;
  });
  const mount = eligible[0];
  return mount ? { mount_id: mount.mount_id, path: mount.mount_path, total_bytes: mount.total_bytes!,
    available_bytes: mount.available_bytes!, classification: mount.classification, shared_capacity: mount.shared_capacity } : null;
}
export function projectDisk(input: DiskProjectionInput) {
  const { at, agent, credential, snapshot, latest } = input;
  const contactAt = agentContactAt(credential);
  const sourceMatches = !!snapshot && (snapshot.enablement_version ?? "1") === (input.control?.enablement_version ?? "1") && snapshot.definition_revision === input.sourceRevision &&
    snapshot.policy_version === input.policyVersion && snapshot.mode === input.mode &&
    snapshot.agent_id === agent?.id && snapshot.generation === agent?.current_generation;
  const contactCurrent = !!agent && !!credential && !agent.revoked_at && !credential.revoked_at &&
    !!contactAt && at >= contactAt &&
    at.getTime() < contactAt.getTime() + agent.stale_after_seconds * 1000;
  if (input.control?.enabled === false) return { state: "disabled" as DiskHealthState, reason: "skill_disabled",
    source_matches: false, contact_current: contactCurrent, valid_until: null, fact_valid_until: null, worst: null, attention: null };
  const anchor = latest ? Math.min(new Date(latest.finished_at).getTime(), new Date(latest.received_at).getTime()) : 0;
  let state: DiskHealthState = "unknown", reason: string;
  if (input.recovery) reason = "assignment_recovery_required";
  else if (!contactCurrent) reason = "contact_unavailable";
  else if (snapshot && (snapshot.enablement_version ?? "1") !== (input.control?.enablement_version ?? "1")) reason = "enablement_changed";
  else if (!snapshot || !sourceMatches) reason = snapshot ? "assignment_obsolete" : "no_assignment";
  else if (snapshot.applicability !== "ready") reason = snapshot.applicability;
  else if (at < snapshot.created_at) reason = "server_clock_uncertain";
  else if (!latest) reason = input.expired ? "history_expired" : "no_observation";
  else if (at < new Date(latest.received_at)) reason = "server_clock_uncertain";
  else if (new Date(latest.finished_at).getTime() > new Date(latest.received_at).getTime() + 30000) reason = "agent_clock_uncertain";
  else if (latest.coverage !== "complete") reason = latest.reason;
  else if (at.getTime() - anchor >= 3 * snapshot.interval_seconds * 1000) { state = "stale"; reason = "observation_stale"; }
  else if (latest.classification === "unknown") reason = "no_writable_mount";
  else { state = latest.classification as DiskHealthState; reason = "none"; }
  const usable = !input.recovery && contactCurrent && sourceMatches && snapshot?.applicability === "ready" && !!latest &&
    at >= new Date(latest.received_at) && at >= snapshot.created_at &&
    new Date(latest.finished_at).getTime() <= new Date(latest.received_at).getTime() + 30000 &&
    new Date(latest.started_at).getTime() <= new Date(latest.received_at).getTime() + 30000 &&
    at.getTime() - anchor < 3 * snapshot.interval_seconds * 1000;
  const evidenceDeadline = usable && contactAt ? new Date(Math.min(
    contactAt.getTime() + agent!.stale_after_seconds * 1000, anchor + 3 * snapshot!.interval_seconds * 1000)).toISOString() : null;
  const worst = usable ? worstDisk(latest!.mounts) : null;
  return { state: state as DiskHealthState, reason, source_matches: sourceMatches, contact_current: contactCurrent,
    valid_until: ["healthy", "warning", "critical"].includes(state) ? evidenceDeadline : null,
    fact_valid_until: worst ? evidenceDeadline : null, worst,
    attention: worst && ["warning", "critical"].includes(worst.classification) ? worst.classification as "warning" | "critical" : null };
}
