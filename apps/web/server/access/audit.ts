import { randomUUID } from "node:crypto";
import type { Transaction } from "kysely";
import type { Database } from "../db/types";

const shapes = {
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
} as const;

type AuditAction = keyof typeof shapes;
interface AuditInput {
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
    if (key === "revoked" ? value !== true :
        key === "fromGeneration" || key === "toGeneration" ?
          !Number.isSafeInteger(value) || Number(value) < 1 :
          typeof value !== "string" || value.length === 0) {
      throw new Error("invalid_audit_event");
    }
  }
  if ((input.action === "agent.enrolled" || input.action === "agent.credential_replaced") &&
      input.targetAgentId !== input.agentId) throw new Error("invalid_audit_event");
  if (input.action === "agent.credential_replaced" &&
      input.toGeneration !== input.fromGeneration! + 1) throw new Error("invalid_audit_event");
}

export async function audit(trx: Transaction<Database>, input: AuditInput): Promise<void> {
  validateAudit(input);
  await trx.insertInto("audit_events").values({
    id: randomUUID(), occurred_at: input.at, action: input.action,
    actor_kind: input.actorKind, operator_id: input.operatorId ?? null,
    target_operator_id: input.targetOperatorId ?? null, agent_id: input.agentId ?? null,
    target_agent_id: input.targetAgentId ?? null,
    host_id: input.hostId ?? null, token_id: input.tokenId ?? null,
    correlation_id: input.correlationId, from_generation: input.fromGeneration ?? null,
    to_generation: input.toGeneration ?? null, revoked: input.revoked ?? null,
  }).execute();
}
