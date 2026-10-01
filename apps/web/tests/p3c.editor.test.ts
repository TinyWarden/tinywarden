import { describe, expect, it } from "vitest";
import { baselineDraft, baselineDirty, baselineDraftValues, validSavedBaseline } from "../app/fleet/baseline-editor-model";

const key = "package-updates";
const values = { interval_seconds: 3600, timeout_seconds: 30, package_mode: "upgrade" as const };
const saved = { schema_version: 1 as const, definition_key: key as typeof key, revision: 3, ...values };
describe("C04 baseline editor state boundaries", () => {
  it("preserves drafts and validates whole-second bounds before saving", () => {
    const draft = baselineDraft(saved);
    expect(baselineDirty(draft, saved)).toBe(false);
    expect(baselineDraftValues({ ...draft, interval: "300", timeout: "1" }, key)).toEqual({ ...values, interval_seconds: 300, timeout_seconds: 1 });
    for (const interval of ["", "0300", "299", "86401", "3600.5", "3e3"]) expect(baselineDraftValues({ ...draft, interval }, key)).toBeNull();
    for (const timeout of ["0", "31", "1.5"]) expect(baselineDraftValues({ ...draft, timeout }, key)).toBeNull();
    expect(baselineDirty({ ...draft, packageMode: "with-new-pkgs" }, saved)).toBe(true);
    expect(baselineDraftValues({ ...draft, packageMode: "with-new-pkgs" }, "reboot-required")).toBeNull();
  });
  it("inheritance ignores dormant input and override pins remain explicit", () => {
    const host = { schema_version: 1 as const, definition_key: key as typeof key, current_default_revision: 4, default_values: values,
      effective_values: values, override_values: null, policy_version: 0, mode: "inherit" as const, pinned_definition_revision: null,
      latest_delivered_revision: null, latest_delivered_values: null, applicability: "unknown" };
    expect(validSavedBaseline(host, key, true)).toBe(true);
    expect(baselineDirty({ ...baselineDraft(host), timeout: "9" }, host)).toBe(false);
    expect(baselineDirty({ ...baselineDraft(host), mode: "override" }, host)).toBe(true);
    expect(validSavedBaseline({ ...host, mode: "override", override_values: values }, key, true)).toBe(false);
    expect(validSavedBaseline({ ...host, mode: "override", override_values: values, pinned_definition_revision: 3 }, key, true)).toBe(true);
    expect(validSavedBaseline({ ...saved, definition_key: "reboot-required" }, key, false)).toBe(false);
    expect(validSavedBaseline({ ...saved, timeout_seconds: 31 }, key, false)).toBe(false);
  });
});
