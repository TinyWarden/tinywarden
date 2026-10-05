import { findSkill } from "../../lib/skills/catalog";
import { randomUUID } from "node:crypto";
import type { Transaction } from "kysely";
import type { Database } from "../db/types";

const shapes = {
  "notification.route_configured": { actor: "system", fields: ["notificationRouteId", "notificationOutcome"] },
  "notification.queued": { actor: "system", fields: ["notificationRouteId", "notificationEventId", "notificationOutcome"] },
  "notification.attempt_started": { actor: "system", fields: ["notificationRouteId", "notificationEventId", "notificationAttemptId", "notificationOutcome"] },
  "notification.attempt_finished": { actor: "system", fields: ["notificationRouteId", "notificationEventId", "notificationAttemptId", "notificationOutcome"] },
  "notification.closed": { actor: "system", fields: ["notificationRouteId", "notificationEventId", "notificationOutcome"] },
  "notification.acknowledged": { actor: "system", fields: ["notificationRouteId", "notificationEventId", "notificationOutcome"] },

  "observation.retention_pruned": { actor: "system", fields: ["retentionFamily", "retentionCutoff",
    "retentionDays", "retentionParentCount", "retentionMountCount"] },
  "operator.initialized": { actor: "system", fields: ["targetOperatorId"] },
  "operator.password_reset": { actor: "system", fields: ["targetOperatorId"] },
  "operator.login": { actor: "operator", fields: ["operatorId"] },
  "operator.logout": { actor: "operator", fields: ["operatorId"] },
  "enrollment.issued": { actor: "operator", fields: ["operatorId", "tokenId"] },
  "enrollment.revoked": { actor: "operator", fields: ["operatorId", "tokenId", "revoked"] },
  "agent.enrolled": { actor: "agent", fields: ["agentId", "targetAgentId", "hostId", "tokenId"] },
  "agent.credential_replaced": { actor: "agent", fields: ["agentId", "targetAgentId",
    "hostId", "tokenId", "fromGeneration", "toGeneration"] },
  "agent.revoked": { actor: "operator", fields: ["operatorId", "targetAgentId", "hostId", "revoked"] },
  "check.definition_initialized": { actor: "system", fields: ["definitionKey", "toDefinitionRevision"] },
  "check.definition_updated": { actor: "operator", fields: ["operatorId", "definitionKey",
    "fromDefinitionRevision", "toDefinitionRevision"] },
  "check.policy_updated": { actor: "operator", fields: ["operatorId", "definitionKey", "hostId",
    "fromPolicyVersion", "toPolicyVersion"] },
  "baseline.definition_initialized": { actor: "system", fields: ["definitionKey", "toDefinitionRevision"] },
  "baseline.definition_updated": { actor: "operator", fields: ["operatorId", "definitionKey",
    "fromDefinitionRevision", "toDefinitionRevision"] },
  "baseline.policy_updated": { actor: "operator", fields: ["operatorId", "definitionKey", "hostId",
    "fromPolicyVersion", "toPolicyVersion"] },
} as const;

type AuditAction = keyof typeof shapes;
interface AuditInput {
  notificationRouteId?: string; notificationEventId?: string;
  notificationAttemptId?: string; notificationOutcome?: string;
  retentionFamily?: "disk" | "baseline" | "history" | "packages";
  retentionCutoff?: Date;
  retentionDays?: number;
  retentionParentCount?: number;
  retentionMountCount?: number;
  action: AuditAction;
  actorKind: "system" | "operator" | "agent";
  at: Date;
  correlationId: string;
  operatorId?: string;
  targetOperatorId?: string;
  agentId?: string;
  targetAgentId?: string;
  hostId?: string;
  tokenId?: string;
  fromGeneration?: number;
  toGeneration?: number;
  revoked?: boolean;
  definitionKey?: string;
  fromDefinitionRevision?: number;
  toDefinitionRevision?: number;
  fromPolicyVersion?: number;
  toPolicyVersion?: number;
}

// One allowlist guards every audit writer. Invalid metadata aborts its outer transaction.
export function validateAudit(input: AuditInput): void {
  if (!Object.hasOwn(shapes, input.action)) throw new Error("invalid_audit_event");
  const shape = shapes[input.action];
  if (input.actorKind !== shape.actor || !(input.at instanceof Date) ||
      !Number.isFinite(input.at.getTime()) || typeof input.correlationId !== "string" ||
      input.correlationId.length === 0) throw new Error("invalid_audit_event");
  const required = new Set<string>(shape.fields);
  const allowed = new Set(["action", "actorKind", "at", "correlationId", ...shape.fields]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new Error("invalid_audit_event");
  }
  for (const key of required) {
    const value = input[key as keyof AuditInput];
    if (key === "retentionCutoff") {
      if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error("invalid_audit_event");
      continue;
    }
    if (["retentionDays", "retentionParentCount", "retentionMountCount"].includes(key)) {
      if (!Number.isSafeInteger(value)) throw new Error("invalid_audit_event");
      continue;
    }
    if (key === "revoked" ? value !== true :
        key === "fromGeneration" || key === "toGeneration" ||
        key === "fromDefinitionRevision" || key === "toDefinitionRevision" ||
        key === "fromPolicyVersion" || key === "toPolicyVersion" ?
          !Number.isSafeInteger(value) || Number(value) < (key === "fromPolicyVersion" ? 0 : 1) :
          typeof value !== "string" || value.length === 0) {
      throw new Error("invalid_audit_event");
    }
  }
  if (input.action.startsWith("notification.") && !/^[a-z_]{1,48}$/.test(input.notificationOutcome!)) throw new Error("invalid_audit_event");
  if (input.action === "observation.retention_pruned" &&
      (!["disk", "baseline", "history", "packages"].includes(input.retentionFamily!) || input.retentionDays !== 90 ||
        input.retentionParentCount! < 1 || input.retentionParentCount! > 100 ||
        input.retentionMountCount! < 0 || input.retentionMountCount! > 12800 ||
        input.retentionFamily !== "disk" && input.retentionMountCount !== 0)) throw new Error("invalid_audit_event");
  if ((input.action === "agent.enrolled" || input.action === "agent.credential_replaced") &&
      input.targetAgentId !== input.agentId) throw new Error("invalid_audit_event");
  if (input.action === "agent.credential_replaced" &&
      input.toGeneration !== input.fromGeneration! + 1) throw new Error("invalid_audit_event");
  if (input.action.startsWith("check.") && input.definitionKey !== "disk-local") {
    throw new Error("invalid_audit_event");
  }
  if (input.action.startsWith("baseline.") &&
    findSkill(input.definitionKey)?.family !== "baseline") throw new Error("invalid_audit_event");
  if ((input.action === "check.definition_updated" || input.action === "baseline.definition_updated") &&
    input.toDefinitionRevision !== input.fromDefinitionRevision! + 1) throw new Error("invalid_audit_event");
  if ((input.action === "check.policy_updated" || input.action === "baseline.policy_updated") &&
    input.toPolicyVersion !== input.fromPolicyVersion! + 1) throw new Error("invalid_audit_event");
}

export async function audit(trx: Transaction<Database>, input: AuditInput): Promise<void> {
  validateAudit(input);
  const baseline = input.action.startsWith("baseline.");
  await trx.insertInto("audit_events").values({
    notification_route: input.notificationRouteId ?? null, notification_event: input.notificationEventId ?? null,
    notification_attempt: input.notificationAttemptId ?? null, notification_outcome: input.notificationOutcome ?? null,
    id: randomUUID(), occurred_at: input.at, action: input.action,
    actor_kind: input.actorKind, operator_id: input.operatorId ?? null,
    target_operator_id: input.targetOperatorId ?? null, agent_id: input.agentId ?? null,
    target_agent_id: input.targetAgentId ?? null,
    host_id: input.hostId ?? null, token_id: input.tokenId ?? null,
    correlation_id: input.correlationId, from_generation: input.fromGeneration ?? null,
    to_generation: input.toGeneration ?? null, revoked: input.revoked ?? null,
    definition_key: baseline ? null : input.definitionKey ?? null,
    from_definition_revision: baseline ? null : input.fromDefinitionRevision ?? null,
    to_definition_revision: baseline ? null : input.toDefinitionRevision ?? null,
    from_policy_version: baseline ? null : input.fromPolicyVersion ?? null,
    to_policy_version: baseline ? null : input.toPolicyVersion ?? null,
    baseline_key: baseline ? input.definitionKey ?? null : null,
    from_baseline_revision: baseline ? input.fromDefinitionRevision ?? null : null,
    to_baseline_revision: baseline ? input.toDefinitionRevision ?? null : null,
    from_baseline_policy: baseline ? input.fromPolicyVersion ?? null : null,
    to_baseline_policy: baseline ? input.toPolicyVersion ?? null : null,
    retention_family: input.retentionFamily ?? null, retention_cutoff: input.retentionCutoff ?? null,
    retention_days: input.retentionDays ?? null, retention_parent_count: input.retentionParentCount ?? null,
    retention_mount_count: input.retentionMountCount ?? null,
  }).execute();
}
