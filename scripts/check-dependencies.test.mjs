import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assessDependencyAudit, checkDependencies } from "./check-dependencies.mjs";

const fixture = JSON.parse(readFileSync(new URL("./testdata/dependency-exception.json", import.meta.url)));
const lock = Buffer.from(JSON.stringify(fixture.lock));
const observed = JSON.parse(readFileSync(new URL("./testdata/npm-u1-dev-advisory.json", import.meta.url)));
const policy = fixture.policy;
const assess = (report, bytes, status, time, approved = policy) => assessDependencyAudit(report, bytes, status, time, approved);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const changedLock = (mutate) => { const value = JSON.parse(lock); mutate(value); return Buffer.from(JSON.stringify(value)); };
const at = new Date("2026-10-03T12:00:00Z");
const clean = { auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities:
  { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } } };

test("matches a historical exception fixture independently of the installed dependency tree", () => {
  assert.deepEqual(assess(observed, lock, 1, at), { outcome: "approved_exception",
    findings: 4, exceptions: [{ advisory: "GHSA-vfj7-8cjw-p6xm", findings: 4, expires_at: "2026-11-01T22:00:00.000Z" }], lock_sha256: hash(lock) });
  assert.equal(policy.exceptions[0].not_before, "2026-10-02T21:00:00.000Z");
  assert.deepEqual(Object.values(policy.exceptions[0].packages).map((pkg) => [pkg.name, pkg.version]),
    [["@next/eslint-plugin-next", "16.3.6"], ["fast-glob", "3.3.1"], ["micromatch", "4.0.8"], ["braces", "3.0.3"]]);
});

test("clean audits pass after exception expiry/removal, even after vulnerable packages are gone", () => {
  const bytes = changedLock((l) => { delete l.packages["node_modules/braces"]; });
  assert.deepEqual(assess(clean, bytes, 0, new Date("2027-01-01"), { version: 1, exceptions: [] }),
    { outcome: "clean", findings: 0, lock_sha256: hash(bytes) });
});

test("unrelated dependency updates and lock formatting do not consume or renew approval", () => {
  for (const bytes of [Buffer.concat([lock, Buffer.from("\n")]), changedLock((l) => {
    l.packages[""].devDependencies.vitest = "5.0.99";
    l.packages["node_modules/vitest"].version = "5.0.99";
  })]) {
    const result = assess(observed, bytes, 1, at);
    assert.equal(result.outcome, "approved_exception");
    assert.equal(result.exceptions[0].expires_at, "2026-11-01T22:00:00.000Z");
    assert.equal(result.lock_sha256, hash(bytes));
    assert.notEqual(result.lock_sha256, hash(lock));
  }
});

test("policy object order is irrelevant and independent exceptions need no checker branches", () => {
  const value = structuredClone(policy);
  value.exceptions[0].edges = value.exceptions[0].edges.toReversed().map((edge) => Object.fromEntries(Object.entries(edge).toReversed()));
  value.exceptions[0].findings.braces.via[0] = Object.fromEntries(Object.entries(value.exceptions[0].findings.braces.via[0]).toReversed());
  assert.equal(assess(observed, lock, 1, at, value).outcome, "approved_exception");
  const name = "example-audit-fixture", path = `node_modules/${name}`, advisory = "https://github.com/advisories/GHSA-aaaa-bbbb-cccc";
  const pkg = { ...value.exceptions[0].packages["node_modules/braces"], name, version: "1.0.0",
    resolved: `https://registry.npmjs.org/${name}/-/${name}-1.0.0.tgz`, dependencies: {} };
  const row = { severity: "high", nodes: [path], via: [{ url: advisory, name, dependency: name, severity: "high" }] };
  value.exceptions.push({ advisory, not_before: value.exceptions[0].not_before, expires_at: value.exceptions[0].expires_at,
    reason: "Synthetic policy fixture", packages: { [path]: pkg }, edges: [{ from: "", kind: "devDependencies", name, spec: "1.0.0", to: path }], findings: { [name]: row } });
  const bytes = changedLock((l) => { l.packages[path] = { ...pkg, dev: true }; l.packages[""].devDependencies[name] = "1.0.0"; });
  const report = structuredClone(observed);
  report.vulnerabilities[name] = { name, ...row };
  report.metadata.vulnerabilities.high++;
  report.metadata.vulnerabilities.total++;
  const result = assess(report, bytes, 1, at, value);
  assert.equal(result.findings, 5);
  assert.equal(result.exceptions.length, 2);
  assert.equal(result.exceptions[1].advisory, "GHSA-aaaa-bbbb-cccc");
});

test("rejects unrelated advisories, extra paths and altered transitive findings", () => {
  for (const mutate of [
    (r) => { r.vulnerabilities.braces.via[0].url = "https://github.com/advisories/GHSA-other"; },
    (r) => { r.vulnerabilities.braces.nodes.push("node_modules/runtime/node_modules/braces"); },
    (r) => { r.vulnerabilities.micromatch.via[0] = "unapproved-package"; },
    (r) => { r.vulnerabilities.braces.via.push({ url: "https://github.com/advisories/GHSA-other" }); },
    (r) => { delete r.vulnerabilities.braces; r.metadata.vulnerabilities.high--; r.metadata.vulnerabilities.total--; },
    (r) => { r.vulnerabilities.braces.severity = "critical"; r.metadata.vulnerabilities.high--; r.metadata.vulnerabilities.critical++; },
    (r) => { r.vulnerabilities.other = { ...r.vulnerabilities.braces, name: "other" }; r.metadata.vulnerabilities.high++; r.metadata.vulnerabilities.total++; },
  ]) {
    const report = structuredClone(observed); mutate(report);
    assert.throws(() => assess(report, lock, 1, at), /unapproved_dependency_finding/);
  }
});

for (const path of Object.keys(policy.exceptions[0].packages)) {
  test(`pins version, registry, integrity, dev placement and dependencies of ${path}`, () => {
    for (const mutate of [
      (pkg) => { pkg.version = "999.0.0"; },
      (pkg) => { pkg.resolved = pkg.resolved.replace("registry.npmjs.org", "unapproved.example"); },
      (pkg) => { pkg.integrity = "sha512-changed"; },
      (pkg) => { pkg.dev = false; },
      (pkg) => { delete pkg.dev; },
      (pkg) => { pkg.devOptional = true; },
      (pkg) => { pkg.inBundle = true; },
      (pkg) => { pkg.dependencies = { ...pkg.dependencies, unrelated: "1.0.0" }; },
      (pkg) => { pkg.optionalDependencies = { braces: "*" }; },
      (pkg) => { pkg.peerDependencies = { braces: "*" }; },
    ]) assert.throws(() => assess(observed, changedLock((l) => mutate(l.packages[path])), 1, at), /scope_changed/);
    assert.throws(() => assess(observed, changedLock((l) => { delete l.packages[path]; }), 1, at), /scope_changed/);
  });
}

test("rejects nested/aliased extra copies even if not reported by the audit", () => {
  for (const mutate of [
    (l) => { l.packages["node_modules/next/node_modules/braces"] = { ...l.packages["node_modules/braces"] }; },
    (l) => { l.packages["node_modules/alias"] = { ...l.packages["node_modules/braces"], name: "braces" }; },
    (l) => { l.packages["node_modules/next/node_modules/@next/eslint-plugin-next"] = { ...l.packages["node_modules/@next/eslint-plugin-next"] }; },
  ]) assert.throws(() => assess(observed, changedLock(mutate), 1, at), /scope_changed/);
});

test("rejects changed or additional consumers, including forged dev flags on production paths", () => {
  for (const kind of ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"]) {
    const bytes = changedLock((l) => { l.packages[""][kind] = { ...l.packages[""][kind], braces: "3.0.3" }; });
    assert.throws(() => assess(observed, bytes, 1, at), /scope_changed/);
  }
  for (const mutate of [
    (l) => { l.packages["node_modules/next"].dependencies.braces = "3.0.3"; },
    (l) => { l.packages["node_modules/next"].dependencies["@next/eslint-plugin-next"] = "16.3.6"; },
    (l) => { l.packages["node_modules/vitest"].dependencies.braces = "3.0.3"; },
    (l) => { l.packages[""].devDependencies["@next/eslint-plugin-next"] = "^16.3.6"; },
    (l) => { l.packages["node_modules/fast-glob"].dependencies.micromatch = "*"; },
  ]) assert.throws(() => assess(observed, changedLock(mutate), 1, at), /scope_changed/);
});

test("fails at the unchanged expiry boundary, before approval and on invalid time", () => {
  assert.equal(assess(observed, lock, 1, new Date("2026-11-01T21:59:59.999Z")).outcome, "approved_exception");
  for (const time of [new Date("2026-11-01T22:00:00Z"), new Date("2026-10-02T20:59:59.999Z"), new Date(NaN)])
    assert.throws(() => assess(observed, lock, 1, time), /expired/);
});

test("fails closed on malformed policy and lock structure", () => {
  for (const value of [{}, { version: 2, exceptions: [] }, { version: 1, exceptions: {} }, { ...policy, unknown: true }])
    assert.throws(() => assess(observed, lock, 1, at, value), /invalid_dependency_exception_policy/);
  for (const mutate of [
    (p) => { p.exceptions[0].expires_at = "never"; },
    (p) => { p.exceptions[0].expires_at = "2026-02-30T00:00:00.000Z"; },
    (p) => { p.exceptions[0].reason = " "; },
    (p) => { p.exceptions[0].packages = {}; },
    (p) => { p.exceptions[0].edges = []; },
    (p) => { p.exceptions[0].edges.push(p.exceptions[0].edges[0]); },
    (p) => { p.exceptions.push(p.exceptions[0]); },
    (p) => { p.exceptions[0].findings.braces.via[0].url = "https://example.test"; },
  ]) {
    const value = structuredClone(policy); mutate(value);
    assert.throws(() => assess(observed, lock, 1, at, value), /invalid_dependency_exception_policy/);
  }
  for (const bytes of [Buffer.from("bad json"), Buffer.from("null"), changedLock((l) => { l.lockfileVersion = 2; }),
    changedLock((l) => { l.packages["node_modules/next"].link = true; }),
    changedLock((l) => { l.packages["node_modules/next"].dependencies = null; })])
    assert.throws(() => assess(observed, bytes, 1, at), /invalid_dependency_lock/);
  assert.throws(() => assess(observed, lock, 1, at, { version: 1, exceptions: [] }), /unapproved_dependency_finding/);
});

test("loads repository policy and invokes the complete audit without filtering vulnerabilities", () => {
  const root = mkdtempSync(join(tmpdir(), "tw-audit-"));
  try {
    mkdirSync(join(root, "scripts"));
    writeFileSync(join(root, "scripts/dependency-exceptions.json"), JSON.stringify({ version: 1, exceptions: [] }));
    writeFileSync(join(root, "package-lock.json"), lock);
    const result = checkDependencies(root, (command, args, options) => {
      assert.equal(command, "npm");
      assert.deepEqual(args, ["audit", "--prefix", root, "--json", "--audit-level=low"]);
      assert.equal(options.timeout, 30000);
      return { status: 0, stdout: JSON.stringify(clean) };
    });
    assert.equal(result.outcome, "clean");
    writeFileSync(join(root, "scripts/dependency-exceptions.json"), "{}");
    assert.throws(() => checkDependencies(root, () => ({ status: 0, stdout: JSON.stringify(clean) })), /invalid_dependency_exception_policy/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("fails closed on malformed reports, inconsistent counts and execution failures", () => {
  for (const report of [{}, { ...clean, error: { code: "E401" } }, { ...clean, auditReportVersion: 3 },
    { ...observed, metadata: clean.metadata }]) assert.throws(() => assess(report, lock, 1, at), /invalid_dependency_audit_report/);
  assert.throws(() => assess(clean, lock, 1, at), /execution_failed/);
  assert.throws(() => assess(observed, lock, 0, at), /invalid_dependency_audit_report/);
  for (const result of [{ error: new Error("failed") }, { signal: "SIGTERM" },
    { stdout: "not json", status: 1 }, { stdout: JSON.stringify(observed), status: 2 }])
    assert.throws(() => checkDependencies("/unused", () => result));
});

test("current policy has no exceptions and cannot accept the historical braces advisory", () => {
  const current = JSON.parse(readFileSync(new URL("./dependency-exceptions.json", import.meta.url)));
  assert.deepEqual(current, { version: 1, exceptions: [] });
  assert.throws(() => assessDependencyAudit(observed, lock, 1, at), /unapproved_dependency_finding/);
  const bytes = readFileSync(new URL("../package-lock.json", import.meta.url));
  assert.equal(assessDependencyAudit(clean, bytes, 0, new Date("2027-01-01")).outcome, "clean");
});
