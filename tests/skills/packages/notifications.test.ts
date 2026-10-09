import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { resolveDetails, detailsHtml, validFragments } from "../../../lib/skills/notification-details";
import type { PackageAssessment } from "../../../lib/skills/package-types";
import { messageSnapshot } from "../../../server/notifications/snapshot";
import { messageV2 } from "../../../server/notifications/message-v2";
import { notificationSettings } from "../../../server/notifications/config";
import { composeNotification } from "../../../server/notifications/message";
import { captureEnv } from "../../p4b.fixture";
import { notificationMetadata } from "./notification-fixture";

const assessment = (reason: string, status: PackageAssessment["status"] = "warning", params = {}, facts: PackageAssessment["facts"] = []): PackageAssessment =>
  ({ from: 1, status, reason: { key: reason, params }, facts });
const prose = (value: ReturnType<typeof resolveDetails>) => value?.map((f) => f.text).join("");
describe("Generic notification Details and app-owned messages", () => {
  it("uses inclusive effective disk thresholds and healthy limits", () => {
    const m = notificationMetadata("disk-local"), settings = { ...m.manifest.defaults, warning_percent: 80, critical_percent: 90 };
    expect(prose(resolveDetails(m, assessment("disk_usage", "warning", { path: "/", percent: 80 }), settings)))
      .toBe("Filesystem / is 80% full, at or above its 80% warning threshold.");
    expect(prose(resolveDetails(m, assessment("disk_usage", "critical", { path: "/home", percent: 90 }), settings)))
      .toContain("90% critical threshold");
    expect(prose(resolveDetails(m, assessment("disk_usage", "healthy", { path: "/", percent: 10 }), settings)))
      .toContain("All monitored writable filesystems are below their warning thresholds");
  });
  it("renders package plurals and every reboot/trim state from declarations", () => {
    const m = notificationMetadata("package-updates");
    const facts: PackageAssessment["facts"] = [1, 2, 0, 1].map((value, i) => ({ key: ["upgraded", "installed", "removed", "held_back"][i]!, kind: "number", label_key: "name", value }));
    expect(prose(resolveDetails(m, assessment("package_changes", "warning", {}, facts), m.manifest.defaults)))
      .toBe("Local package plan: 1 upgrade, 2 new packages, 0 removals, 1 package held back.");
    expect(prose(resolveDetails(m, assessment("package_plan_clear", "healthy"), m.manifest.defaults))).toContain("no pending package changes");
    for (const alias of ["reboot-required", "fstrim-status"] as const) {
      const meta = notificationMetadata(alias);
      for (const rule of meta.notifications!.rules) expect(resolveDetails(meta, assessment(rule.reason, rule.states[0]), meta.manifest.defaults)).not.toBeNull();
    }
    const trim = notificationMetadata("fstrim-status");
    expect(prose(resolveDetails(trim, assessment("fstrim_result_overdue"), trim.manifest.defaults))).toContain("at least 24 hours overdue");
    expect(prose(resolveDetails(trim, assessment("fstrim_scheduled", "healthy"), trim.manifest.defaults))).toContain("still awaited");
  });
  it("keeps hostile substitutions literal and supports only three structured marks", () => {
    const m = notificationMetadata("disk-local"); m.manifest.id = "community/example";
    m.notifications!.rules[0]!.marks = ["italic", "underline"];
    const value = resolveDetails(m, assessment("disk_usage", "warning", { path: "<img>& {used} **raw**", percent: 85 }), m.manifest.defaults)!;
    expect(detailsHtml(value)).toContain("<strong><em><u>&lt;img&gt;&amp; {used} **raw**</u></em></strong>");
    expect(prose(value)).toContain("{used} **raw**");
    for (const path of ["https://bad.test", "www.bad.test", "data:bad", "bad\nline", "bad\u202evalue", "a".repeat(401)])
      expect(resolveDetails(m, assessment("disk_usage", "warning", { path, percent: 85 }), m.manifest.defaults)).toBeNull();
    expect(validFragments([{ text: "hi", marks: ["html"] }])).toBe(false);
    expect(validFragments(Array.from({ length: 65 }, () => ({ text: "a", marks: [] })))).toBe(false);
    expect(validFragments([{ text: "😀".repeat(400), marks: ["bold"] }])).toBe(true);
  });
  it("omits missing, duplicate, wrong-type and oversized values", () => {
    const m = notificationMetadata("package-updates"), a = assessment("package_changes");
    expect(resolveDetails(m, a, m.manifest.defaults)).toBeNull();
    a.facts = ["upgraded", "installed", "removed", "held_back"].map((key) => ({ key, label_key: "name", kind: "number", value: 1 }));
    a.facts.push(a.facts[0]!); expect(resolveDetails(m, a, m.manifest.defaults)).toBeNull();
    a.facts.pop(); a.facts[0] = { key: "upgraded", label_key: "name", kind: "text", value: "1" };
    expect(resolveDetails(m, a, m.manifest.defaults)).toBeNull();
    const disk = notificationMetadata("disk-local"); delete disk.notifications;
    expect(resolveDetails(disk, assessment("disk_usage"), disk.manifest.defaults)).toBeNull();
  });
  it("owns subjects, provenance, HTML and plain text for all four message families", async () => {
    const settings = notificationSettings(captureEnv), at = new Date("2026-10-08T08:00:00.000Z"), m = notificationMetadata("disk-local");
    const s = messageSnapshot({ host_id: randomUUID(), agent_id: randomUUID(), generation: "1", key: "disk-local", eligible: true,
      source_revision: "1", policy_version: "0", state: "warning", reason: "skill_assessment", as_of: at.toISOString(),
        valid_until: null, current_assignment_id: null, name: "Disk space", metadata: m, settings: m.manifest.defaults,
      measured_at: "2026-10-08T07:59:00.000Z", assessment: assessment("disk_usage", "warning", { path: "/", percent: 85 }) }, "server");
    s.time_zone = "Europe/Bucharest";
    for (const [key, state, subject] of [["contact", "offline", "[CRITICAL] server · Agent contact lost"], ["contact", "healthy", "[RESTORED] server · Agent contact restored"],
      ["disk-local", "warning", "[WARNING] server · Disk space"], ["disk-local", "healthy", "[RESOLVED] server · Disk space"]] as const) {
      const mail = { eventId: randomUUID(), hostId: randomUUID(), label: "server", key, state, sampledAt: at, templateVersion: 2, fromState: "warning", checkName: "Disk space", snapshot: key === "contact" ? null : s };
      const message = messageV2(settings, mail); expect(message.subject).toBe(subject); expect(message.subject).not.toContain("TinyWarden");
      if (key !== "contact") expect(message.text).not.toContain("contact restored");
      expect((await composeNotification(settings, mail)).length).toBeLessThan(16384);
      if (key !== "contact") {
        expect(message.text).toContain("Reading taken:"); expect(message.text).toContain("Europe/Bucharest");
        expect(message.text).toContain("Filesystem / is 85% full"); expect(message.html).toContain("<strong>/</strong>");
      }
      expect(messageV2(settings, { ...mail, snapshot: { bad: true } }).text).not.toContain("Details:");
    }
    const contact = { ...s, kind: "contact" as const, skill_name: null, details: null, contact_at: "2026-10-08T07:56:00.000Z" };
    const mail = { eventId: randomUUID(), hostId: randomUUID(), label: "server", key: "contact" as const, state: "offline", sampledAt: at, snapshot: contact };
    expect(messageV2(settings, mail).text).toContain("4 minutes");
    expect(messageV2(settings, { ...mail, state: "healthy" }).text).toContain("Contact received:");
    expect((await composeNotification(settings, { ...mail, templateVersion: 1 })).toString()).toContain("TinyWarden: a host needs attention");
  });
});
