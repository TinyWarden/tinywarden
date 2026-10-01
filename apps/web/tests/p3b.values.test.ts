import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { evaluateBaseline } from "../server/checks/baseline-evaluation";
import { parseBaselineObservation } from "../server/checks/baseline-values";
import { baselineProblems, evaluators, type BaselineObservation } from "../server/checks/baseline-types";

function evidence(key: string, name: string): BaselineObservation {
  const path = new URL(`../../../agent/internal/baseline/testdata/${key}/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(path), "utf8")).expected as BaselineObservation;
}
const packages = () => evidence("package-updates", "zero-cached-plan");
const trim = () => evidence("fstrim-status", "completed-service-and-schedule");

it("keeps every supported execution/parser failure unknown", () => {
  const o = packages();
  for (const problem of baselineProblems.filter((p) => p !== "none")) {
    const failed = { ...o, problem, packages: null, execution: [] };
    expect(parseBaselineObservation(failed)).toEqual(failed);
    expect(evaluateBaseline(failed, evaluators[o.key])).toEqual({ state: "unknown", reason: problem,
      incomplete: true, informational: false });
  }
});

it("rejects impossible counts and invented cache assurance", () => {
  for (const count of [-1, 0.5, NaN, Infinity, 1_000_001, "0", null]) {
    const o = packages();
    expect(parseBaselineObservation({ ...o, packages: { ...o.packages, upgraded: count } })).toBeNull();
  }
  for (const extra of [{ upgraded: 1_000_000, installed: 1 }, { index_freshness: "verified" },
    { state_consistency: "verified" }, { security_updates: 0 }]) {
    const o = packages();
    expect(parseBaselineObservation({ ...o, packages: { ...o.packages, ...extra } })).toBeNull();
  }
});

it("rejects raw fields, wrong versions and contradictory execution", () => {
  const mutations: ((o: BaselineObservation) => unknown)[] = [
    (o) => ({ ...o, stdout: "synthetic-secret" }), (o) => ({ ...o, schema_version: 2 }),
    (o) => ({ ...o, key: "other" }), (o) => ({ ...o, normalizer: "other" }),
    (o) => ({ ...o, problem: "other" }), (o) => ({ ...o, problem: "execution_failed" }),
    (o) => ({ ...o, execution: [] }), (o) => ({ ...o, execution: [o.execution[0], o.execution[0]] }),
    (o) => ({ ...o, execution: [{ ...o.execution[0], profile: "other" }] }),
    (o) => ({ ...o, execution: [{ ...o.execution[0], stdout: "raw" }] }),
    (o) => ({ ...o, execution: [{ ...o.execution[0], stdout_truncated: true }] }),
    (o) => ({ ...o, execution: [{ ...o.execution[0], cleanup_complete: false }] }),
    (o) => ({ ...o, execution: [{ ...o.execution[0], exit_code: 256 }] }),
    (o) => ({ ...o, execution: [{ ...o.execution[0], signal: 9 }] }),
    (o) => ({ ...o, execution: [{ ...o.execution[0], exit_code: 1 }] }),
  ];
  for (const change of mutations) {
    const o = change(packages());
    expect(parseBaselineObservation(o)).toBeNull();
    expect(evaluateBaseline(o, evaluators["package-updates"]).state).toBe("unknown");
  }
});

it("requires marker status to agree with its command exit", () => {
  const o = evidence("reboot-required", "marker-present");
  expect(parseBaselineObservation({ ...o, reboot: { ...o.reboot, marker_observed: false } })).toBeNull();
  expect(parseBaselineObservation({ ...o, reboot: { ...o.reboot, assurance: "verified" } })).toBeNull();
});

it("rejects unsupported timestamps, impossible status and invented reclamation", () => {
  for (const value of [0, -1, 1.5, NaN, 253402300800, "1790000000"]) {
    const o = trim();
    expect(parseBaselineObservation({ ...o, fstrim: { ...o.fstrim, observed_at: value } })).toBeNull();
  }
  const o = trim(), f = o.fstrim!;
  const invalid = [
    { ...f, reclamation_verified: true }, { ...f, timer: { ...f.timer, next_elapse: f.observed_at } },
    { ...f, timer: { ...f.timer, last_trigger: f.observed_at + 1 } },
    { ...f, service: { ...f.service, exit_kind: 0, exit_status: 1 } },
    { ...f, service: { ...f.service, exit_kind: 2, exit_status: 0 } },
    { ...f, service: { ...f.service, started_at: f.service.finished_at! + 1 } },
    { ...f, service: { ...f.service, condition: { passed: true, checked_at: null } } },
  ];
  for (const value of invalid) expect(parseBaselineObservation({ ...o, fstrim: value })).toBeNull();
});

it("cannot declare a transitional or unevaluated service healthy", () => {
  const o = trim(), f = o.fstrim!;
  for (const active_state of ["active", "activating", "deactivating", "reloading", "refreshing", "maintenance"]) {
    expect(evaluateBaseline({ ...o, fstrim: { ...f, service: { ...f.service, active_state } } }, evaluators[o.key]).state).toBe("unknown");
  }
  for (const condition of [{ passed: null, checked_at: null }, { passed: true, checked_at: f.service.started_at! + 1 }]) {
    expect(evaluateBaseline({ ...o, fstrim: { ...f, service: { ...f.service, condition } } }, evaluators[o.key]).state).toBe("unknown");
  }
});
