import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessDependencyAudit, checkDependencies } from "./check-dependencies.mjs";

const lock = readFileSync(new URL("../package-lock.json", import.meta.url));
const observed = JSON.parse(readFileSync(new URL("./testdata/npm-u1-dev-advisory.json", import.meta.url)));
const at = new Date("2026-10-03T12:00:00Z");
const clean = { auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities:
  { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } } };

test("accepts the captured U1 advisory explicitly and clean audits without an exception", () => {
  assert.deepEqual(assessDependencyAudit(observed, lock, 1, at), { outcome: "approved_exception",
    advisory: "GHSA-vfj7-8cjw-p6xm", findings: 4, expires_at: "2026-11-01T22:00:00.000Z" });
  assert.deepEqual(assessDependencyAudit(clean, Buffer.from("changed lock"), 0, new Date("2027-01-01")), { outcome: "clean", findings: 0 });
});

test("rejects unrelated advisories, extra paths and altered transitive findings", () => {
  for (const mutate of [
    (r) => { r.vulnerabilities.braces.via[0].url = "https://github.com/advisories/GHSA-other"; },
    (r) => { r.vulnerabilities.braces.nodes.push("node_modules/runtime/node_modules/braces"); },
    (r) => { r.vulnerabilities.micromatch.via[0] = "unapproved-package"; },
    (r) => { r.vulnerabilities.braces.via.push({ url: "https://github.com/advisories/GHSA-other" }); },
    (r) => { r.vulnerabilities.other = { ...r.vulnerabilities.braces, name: "other" }; r.metadata.vulnerabilities.high++; r.metadata.vulnerabilities.total++; },
  ]) {
    const report = structuredClone(observed); mutate(report);
    assert.throws(() => assessDependencyAudit(report, lock, 1, at), /unapproved_dependency_finding/);
  }
});

test("rejects changed lockfiles, runtime placement and expired approval", () => {
  assert.throws(() => assessDependencyAudit(observed, Buffer.concat([lock, Buffer.from("\n")]), 1, at), /lock_changed/);
  const runtime = JSON.parse(lock); runtime.packages["node_modules/braces"].dev = false;
  assert.throws(() => assessDependencyAudit(observed, Buffer.from(JSON.stringify(runtime)), 1, at), /lock_changed/);
  assert.equal(JSON.parse(lock).packages["node_modules/braces"].dev, true);
  assert.throws(() => assessDependencyAudit(observed, lock, 1, new Date("2026-11-01T22:00:00Z")), /expired/);
});

test("fails closed on malformed reports, inconsistent counts and execution failures", () => {
  for (const report of [{}, { ...clean, error: { code: "E401" } }, { ...clean, auditReportVersion: 3 },
    { ...observed, metadata: clean.metadata }]) assert.throws(() => assessDependencyAudit(report, lock, 1, at), /invalid_dependency_audit_report/);
  assert.throws(() => assessDependencyAudit(clean, lock, 1, at), /execution_failed/);
  assert.throws(() => assessDependencyAudit(observed, lock, 0, at), /invalid_dependency_audit_report/);
  for (const result of [{ error: new Error("failed") }, { signal: "SIGTERM" },
    { stdout: "not json", status: 1 }, { stdout: JSON.stringify(observed), status: 2 }])
    assert.throws(() => checkDependencies("/unused", () => result));
});
