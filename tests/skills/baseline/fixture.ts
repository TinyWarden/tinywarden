import { randomUUID } from "node:crypto";
import { parseDatabaseUrl, type AppConfig } from "../../../server/config";
import { baselineKeys, normalizers, type BaselineKey } from "../../../server/skills/legacy/shared/types";
import type { BaselineDelivery } from "../../../server/skills/assignments/baseline-delivery";
import type { BaselineHistory } from "../../../server/skills/results/baseline-health";
import { agentBaselineAssignments, agentBaselineRun, operatorBaselines, operatorBaselineDefinition,
  operatorUpdateBaselineDefinition, operatorBaselinePolicy, operatorSetBaselinePolicy } from "../../../server/http/baseline-handlers";
import { agentHeartbeat } from "../../../server/http/handlers";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { makeRequest, setupFixture } from "../disk/fixture";

export const url = process.env.TW_TEST_DATABASE_URL;
if (url && new URL(parseDatabaseUrl(url, "tinywarden")).pathname !== "/tinywarden_test_p1b") throw new Error("P3.C requires the reserved test database");
export type Wire = { revision: number; changed: boolean; duplicate: boolean; policy_version: number;
  interval_seconds: number; timeout_seconds: number; package_mode: string; current_default_revision: number;
  pinned_definition_revision: number | null; generation: number; assignments: BaselineDelivery[];
  override_values: unknown; effective_values: { interval_seconds: number; timeout_seconds: number; package_mode: string };
  checks: { definition_key: BaselineKey; state: string; reason: string; latest: BaselineHistory | null; history: BaselineHistory[] }[];
  received_at: string; error: { code: string } };
export async function wire(r: Response): Promise<Wire> { return await r.json() as Wire; }

export async function fixture() {
  let time = new Date(Date.now() + 3600_000);
  const clock = () => new Date(time);
  const origin = "https://p3c.example.org";
  const config: AppConfig = { origin, databaseUrl: url!, heartbeatIntervalSeconds: 60, staleAfterSeconds: 180 };
  const f = await setupFixture(url!, config, clock);
  const req = makeRequest(origin);
  const defs = (key: BaselineKey) => `/api/v1/operator/baseline-definitions/${key}`;
  const policy = (key: BaselineKey) => `/api/v1/operator/hosts/${f.hostId}/baselines/${key}`;
  return { ...f, req, origin, clock, setTime: (v: Date) => { time = new Date(v); },
    fetch: (known = baselineKeys.map((definition_key) => ({ definition_key, known: null as unknown })), capabilities = ["exec_observe.debian13.v1"], credential = f.agentCredential) =>
      agentBaselineAssignments(req("/api/v1/agent/baseline-assignments", { schema_version: 1, agent_version: "0.0.1", capabilities, known_assignments: known }, credential), f.ctx),
    defaults: (key: BaselineKey) => operatorBaselineDefinition(req(defs(key), undefined, undefined, f.session), key, f.ctx),
    edit: (key: BaselineKey, revision: number, values: { interval_seconds: number; timeout_seconds: number; package_mode: string }, requestId: string = randomUUID()) =>
      operatorUpdateBaselineDefinition(req(defs(key), { schema_version: 1, request_id: requestId, expected_revision: revision, ...values }, undefined, f.session), key, f.ctx),
    policy: (key: BaselineKey) => operatorBaselinePolicy(req(policy(key), undefined, undefined, f.session), f.hostId, key, f.ctx),
    setPolicy: (key: BaselineKey, version: number, revision: number, mode: string, values?: { interval_seconds: number; timeout_seconds: number; package_mode: string }, requestId: string = randomUUID()) =>
      operatorSetBaselinePolicy(req(policy(key), { schema_version: 2, request_id: requestId, expected_policy_version: version, expected_default_revision: revision, overrides: mode === "override" && values ? { interval_seconds: values.interval_seconds, timeout_seconds: values.timeout_seconds, ...(key === "package-updates" ? { package_mode: values.package_mode } : {}) } : {} }, undefined, f.session), f.hostId, key, f.ctx),
    heartbeat: (sequence: number) => agentHeartbeat(req("/api/v1/agent/heartbeat", { schema_version: 1, sequence, sent_at: clock().toISOString(), agent_version: "0.0.1" }, f.agentCredential), f.ctx),
    health: () => operatorBaselines(req(`/api/v1/operator/hosts/${f.hostId}/baselines`, undefined, undefined, f.session), f.hostId, f.ctx),
    run: (value: unknown, credential = f.agentCredential) => agentBaselineRun(req("/api/v1/agent/baseline-runs", value, credential), f.ctx),
  };
}
export function known(assignments: BaselineDelivery[]) {
  return assignments.map((a) => ({ definition_key: a.definition_key, known: { id: a.assignment_id, revision: a.revision, digest: a.digest } }));
}
export function sample(key: BaselineKey, delivery: BaselineDelivery, now: Date, sequence: number, failure = false) {
  const file = key === "fstrim-status" ? "completed-service-and-schedule" : key === "package-updates" ? "pending-upgrades" : "marker-not-observed";
  const path = fileURLToPath(new URL(`../../fixtures/agent/internal/baseline/testdata/${key}/${file}.json`, import.meta.url));
  const observation = JSON.parse(readFileSync(path, "utf8")).expected;
  const finished = new Date(now.getTime() - 1000);
  if (observation.fstrim) {
    const trim = observation.fstrim;
    const delta = Math.floor(finished.getTime() / 1000) - trim.observed_at;
    // Move the dated sample as one timeline; preserve every relative schedule boundary.
    for (const [owner, keys] of [[trim, ["observed_at"]],
      [trim.timer, ["last_trigger", "next_elapse"]], [trim.timer.condition, ["checked_at"]],
      [trim.service, ["started_at", "finished_at"]], [trim.service.condition, ["checked_at"]]] as const) {
      for (const key of keys) if (typeof owner?.[key] === "number") owner[key] += delta;
    }
  }
  if (observation.packages && delivery.assignment) observation.packages.mode = delivery.assignment.recipe.steps[0]!.argv.length === 3 ? "with-new-pkgs" : "upgrade";
  if (failure) Object.assign(observation, { problem: "output_unsupported", execution: [], packages: null, reboot: null, fstrim: null });
  observation.normalizer = normalizers[key];
  return { schema_version: 1, run_id: randomUUID(), run_sequence: sequence, assignment_id: delivery.assignment_id,
    started_at: new Date(now.getTime() - 2000).toISOString(), finished_at: finished.toISOString(), dropped_runs: 0, observation };
}
