import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateBaseline } from "../server/checks/baseline-evaluation";
import { parseBaselineObservation } from "../server/checks/baseline-values";
import { baselineKeys, baselineReasons, evaluators, type BaselineObservation,
  type BaselineKey, type Assessment } from "../server/checks/baseline-types";
import messages from "../messages/en.json";

type Fixture = { version: number; name: string; key: BaselineKey;
  expected: BaselineObservation; assessment: Assessment };
const directory = fileURLToPath(new URL("../../../agent/internal/baseline/testdata/", import.meta.url));
const fixtures: Fixture[] = baselineKeys.flatMap((key) => readdirSync(join(directory, key)).filter((p) => p.endsWith(".json"))
  .map((p) => JSON.parse(readFileSync(join(directory, key, p), "utf8")) as Fixture));

describe("versioned shared normalizer/evaluator fixtures", () => {
  it.each(fixtures)("$key: $name", (f) => {
    expect(f.version).toBe(1);
    expect(parseBaselineObservation(f.expected)).toEqual(f.expected);
    expect(evaluateBaseline(f.expected, evaluators[f.key])).toEqual(f.assessment);
  });
  it("keeps all keys and reasons catalog-backed", () => {
    expect(new Set(fixtures.map((f) => f.key))).toEqual(new Set(baselineKeys));
    expect(Object.keys(messages.baseline.reasons).sort()).toEqual([...baselineReasons].sort());
    for (const reason of Object.values(messages.baseline.reasons)) expect(reason.trim().length).toBeGreaterThan(0);
  });
  it("cannot turn a new evaluator or normalizer into healthy evidence", () => {
    const f = fixtures.find((f) => f.assessment.state === "healthy")!;
    expect(evaluateBaseline(f.expected, "fstrim-systemd.v2").state).toBe("unknown");
    expect(evaluateBaseline({ ...f.expected, normalizer: "fstrim-systemd.debian13.v2" }, evaluators[f.key]).state).toBe("unknown");
  });
});
