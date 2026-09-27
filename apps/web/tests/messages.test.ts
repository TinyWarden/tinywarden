import { describe, expect, it } from "vitest";
import messages from "../messages/en.json";

function leaves(value: unknown): unknown[] {
  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap(leaves);
  }
  return [value];
}

describe("English catalog contract", () => {
  it("has no empty or non-text messages that could create blank accessible names", () => {
    for (const value of leaves(messages)) {
      expect(typeof value).toBe("string");
      expect((value as string).trim()).not.toBe("");
    }
  });

  it("keeps untrusted HTML out of plain-text messages", () => {
    for (const value of leaves(messages)) expect(value).not.toMatch(/<\/?[a-z][^>]*>/i);
  });
});
