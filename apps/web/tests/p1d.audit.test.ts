import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateAudit } from "../server/access/audit";

type Event = Parameters<typeof validateAudit>[0];
const operator = randomUUID();
const agent = randomUUID();
const host = randomUUID();
const token = randomUUID();
const base = { at: new Date("2026-09-28T17:00:00.000Z"), correlationId: randomUUID() };
const valid: Event[] = [
  { ...base, action: "operator.initialized", actorKind: "system", targetOperatorId: operator },
  { ...base, action: "operator.password_reset", actorKind: "system", targetOperatorId: operator },
  { ...base, action: "operator.login", actorKind: "operator", operatorId: operator },
  { ...base, action: "operator.logout", actorKind: "operator", operatorId: operator },
  { ...base, action: "enrollment.issued", actorKind: "operator", operatorId: operator,
    tokenId: token },
  { ...base, action: "enrollment.revoked", actorKind: "operator", operatorId: operator,
    tokenId: token, revoked: true },
  { ...base, action: "agent.enrolled", actorKind: "agent", agentId: agent,
    targetAgentId: agent, hostId: host, tokenId: token },
  { ...base, action: "agent.credential_replaced", actorKind: "agent", agentId: agent,
    targetAgentId: agent, hostId: host, tokenId: token, fromGeneration: 1, toGeneration: 2 },
  { ...base, action: "agent.revoked", actorKind: "operator", operatorId: operator,
    targetAgentId: agent, hostId: host, revoked: true },
];

describe("audit action provenance", () => {
  it("accepts each contracted actor and target shape", () => {
    expect(valid).toHaveLength(9);
    for (const event of valid) expect(() => validateAudit(event)).not.toThrow();
  });

  it("rejects mixed actors, missing or mismatched targets and unexpected changes", () => {
    const missingTarget: Event = { ...valid[8]! };
    delete missingTarget.targetAgentId;
    const invalid: Event[] = [
      { ...valid[0]!, operatorId: operator },
      { ...valid[2]!, agentId: agent },
      { ...valid[4]!, targetAgentId: agent },
      { ...valid[5]!, revoked: false },
      { ...valid[6]!, targetAgentId: randomUUID() },
      { ...valid[7]!, toGeneration: 4 },
      missingTarget,
      { ...valid[8]!, agentId: agent },
      { ...valid[8]!, tokenId: token },
      { ...valid[8]!, actorKind: "agent" },
    ];
    for (const event of invalid) {
      expect(() => validateAudit(event)).toThrow("invalid_audit_event");
    }
  });
});
