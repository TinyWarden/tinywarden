import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const advisory = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";
const approvedLock = "1eea6afe872b5fce2e1dd8d248dca37cd54ec316a82c74a7ae50d6763f12f72e";
const expiresAt = Date.parse("2026-11-02T00:00:00+02:00");
const chain = { "@next/eslint-plugin-next": ["16.3.6", "fast-glob"],
  "fast-glob": ["3.3.1", "micromatch"], "micromatch": ["4.0.8", "braces"], "braces": ["3.0.3", null] };
const object = (value) => !!value && typeof value === "object" && !Array.isArray(value);
const fail = (reason) => { throw new Error(reason); };

// Owner-approved U1 exception: every other dependency finding still blocks.
export function assessDependencyAudit(report, lockBytes, status, at = new Date()) {
  if (![0, 1].includes(status) || !object(report) || report.error || report.auditReportVersion !== 2 ||
      !object(report.vulnerabilities) || !object(report.metadata?.vulnerabilities)) fail("invalid_dependency_audit_report");
  const entries = Object.entries(report.vulnerabilities), counts = report.metadata.vulnerabilities;
  const levels = ["info", "low", "moderate", "high", "critical"];
  if (![...levels, "total"].every((level) => Number.isSafeInteger(counts[level]) && counts[level] >= 0) ||
      counts.total !== entries.length || levels.reduce((sum, level) => sum + counts[level], 0) !== entries.length ||
      entries.some(([name, row]) => !object(row) || row.name !== name || !levels.includes(row.severity) ||
        !Array.isArray(row.via) || !row.via.length || !Array.isArray(row.nodes) || !row.nodes.length) ||
      levels.some((level) => entries.filter(([, row]) => row.severity === level).length !== counts[level])) fail("invalid_dependency_audit_report");
  if (!entries.length) {
    if (status !== 0) fail("dependency_audit_execution_failed");
    return { outcome: "clean", findings: 0 };
  }
  if (status !== 1) fail("invalid_dependency_audit_report");
  const time = at.getTime();
  if (!Number.isFinite(time) || time < Date.parse("2026-10-03T00:00:00+03:00") || time >= expiresAt) fail("dependency_exception_expired");
  if (createHash("sha256").update(lockBytes).digest("hex") !== approvedLock) fail("dependency_exception_lock_changed");
  let lock;
  try { lock = JSON.parse(lockBytes.toString()); } catch { fail("invalid_dependency_lock"); }
  for (const [name, [version]] of Object.entries(chain)) {
    const pkg = lock.packages?.[`node_modules/${name}`];
    if (!pkg || pkg.dev !== true || pkg.version !== version) fail("dependency_exception_scope_changed");
  }
  if (!report.vulnerabilities.braces) fail("unapproved_dependency_finding");
  for (const [name, row] of entries) {
    if (!Object.hasOwn(chain, name) || row.severity !== "high" || row.nodes.length !== 1 || row.nodes[0] !== `node_modules/${name}` ||
        row.via.length !== 1) fail("unapproved_dependency_finding");
    const parent = chain[name][1], via = row.via[0];
    if (parent ? via !== parent : !object(via) || via.url !== advisory || via.name !== "braces" ||
        via.dependency !== "braces" || via.severity !== "high") fail("unapproved_dependency_finding");
  }
  return { outcome: "approved_exception", advisory: "GHSA-vfj7-8cjw-p6xm", findings: entries.length,
    expires_at: new Date(expiresAt).toISOString() };
}

export function checkDependencies(root, run = spawnSync) {
  const web = resolve(root);
  const result = run("npm", ["audit", "--prefix", web, "--json", "--audit-level=low"],
    { encoding: "utf8", timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.signal || ![0, 1].includes(result.status)) fail("dependency_audit_execution_failed");
  let report;
  try { report = JSON.parse(result.stdout); } catch { fail("invalid_dependency_audit_report"); }
  return assessDependencyAudit(report, readFileSync(resolve(web, "package-lock.json")), result.status);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = checkDependencies(fileURLToPath(new URL("../", import.meta.url)));
    process.stdout.write(`${result.outcome === "clean" ? "Dependency audit clean" :
      `Dependency audit accepted with explicit temporary exception ${result.advisory}; ${result.findings} raw findings retained; expires ${result.expires_at}`}\n`);
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
