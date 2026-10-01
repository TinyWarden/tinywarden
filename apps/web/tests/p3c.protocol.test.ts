import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { baselineKeys } from "../server/checks/baseline-types";
import { baselineAssignmentDigest, type BaselineDelivery } from "../server/checks/baseline-delivery";
import { parseBaselineRecipe } from "../server/checks/baseline-recipe";
import { validateJsonStructure } from "../server/http/json-structure";

it.each(baselineKeys)("pins independent canonical assignment digest for %s", (key) => {
  const path = fileURLToPath(new URL(`../../../agent/internal/agent/testdata/baseline-v1/${key}.json`, import.meta.url));
  const f = JSON.parse(readFileSync(path, "utf8")) as { version: number; host_id: string; agent_id: string;
    generation: number; delivery: BaselineDelivery };
  expect(f.version).toBe(1);
  const d = f.delivery, a = d.assignment!;
  expect(parseBaselineRecipe(key, a.recipe)).toEqual(a.recipe);
  expect(baselineAssignmentDigest(f.host_id, f.agent_id, f.generation, key, d.assignment_id, d.revision, a).toString("hex")).toBe(d.digest);
  expect(baselineAssignmentDigest(f.host_id, f.agent_id, f.generation + 1, key, d.assignment_id, d.revision, a).toString("hex")).not.toBe(d.digest);
});
it("rejects duplicate decoded JSON fields and excessive depth", () => {
  for (const value of ['{"schema_version":1,"schema_version":2}', '{"a":{"recipe":1,"re\\u0063ipe":2}}',
    '['.repeat(18) + '1' + ']'.repeat(18)]) expect(() => validateJsonStructure(value)).toThrow();
  expect(() => validateJsonStructure(JSON.stringify({ a: [{ id: "x" }, { id: "y" }], b: 'escaped "quote"' }))).not.toThrow();
});
