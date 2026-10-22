import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const object = (value) => !!value && typeof value === "object" && !Array.isArray(value);
const fail = (reason) => { throw new Error(reason); };
const levels = ["info", "low", "moderate", "high", "critical"];
const kinds = ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"];
const packageName = /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/;
const packagePath = /^(?:node_modules\/(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)(?:\/node_modules\/(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)*$/;
const strings = (value) => object(value) && Object.entries(value).every(([name, spec]) => packageName.test(name) &&
  name !== "." && name !== ".." && typeof spec === "string" && spec.length > 0);
const keys = (value, expected) => object(value) && Object.keys(value).sort().join() === [...expected].sort().join();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : object(value) ?
  Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
const sorted = (values) => values.map((value) => JSON.stringify(canonical(value))).sort();
const defaultPolicy = JSON.parse(readFileSync(new URL("./dependency-exceptions.json", import.meta.url)));

function validatePolicy(policy) {
  if (!keys(policy, ["version", "exceptions"]) || policy.version !== 1 || !Array.isArray(policy.exceptions)) fail("invalid_dependency_exception_policy");
  const advisories = new Set(), names = new Set();
  for (const entry of policy.exceptions) {
    if (!keys(entry, ["advisory", "not_before", "expires_at", "reason", "packages", "edges", "findings"]) ||
        typeof entry.advisory !== "string" || !/^https:\/\/github\.com\/advisories\/GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/.test(entry.advisory) ||
        advisories.has(entry.advisory) || typeof entry.reason !== "string" || !entry.reason.trim() ||
        ![entry.not_before, entry.expires_at].every((value) => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
          Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value) ||
        Date.parse(entry.not_before) >= Date.parse(entry.expires_at) ||
        !object(entry.packages) || !Object.keys(entry.packages).length || !Array.isArray(entry.edges) || !entry.edges.length ||
        !object(entry.findings) || !Object.keys(entry.findings).length) fail("invalid_dependency_exception_policy");
    advisories.add(entry.advisory);
    for (const [path, pkg] of Object.entries(entry.packages)) {
      if (!packagePath.test(path) || !keys(pkg, ["name", "version", "resolved", "integrity", "dependencies"]) ||
          !packageName.test(pkg.name) || !path.endsWith(`node_modules/${pkg.name}`) ||
          typeof pkg.version !== "string" || !pkg.version || typeof pkg.resolved !== "string" || !pkg.resolved.startsWith("https://registry.npmjs.org/") ||
          typeof pkg.integrity !== "string" || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(pkg.integrity) || !strings(pkg.dependencies)) fail("invalid_dependency_exception_policy");
    }
    for (const edge of entry.edges) {
      if (!keys(edge, ["from", "kind", "name", "spec", "to"]) || (edge.from !== "" && !packagePath.test(edge.from)) ||
          !kinds.includes(edge.kind) || (edge.kind === "devDependencies" && edge.from !== "") || !packageName.test(edge.name) ||
          typeof edge.spec !== "string" || !edge.spec || !Object.hasOwn(entry.packages, edge.to)) fail("invalid_dependency_exception_policy");
    }
    if (new Set(sorted(entry.edges)).size !== entry.edges.length) fail("invalid_dependency_exception_policy");
    let direct = false;
    for (const [name, row] of Object.entries(entry.findings)) {
      if (names.has(name) || !packageName.test(name) || !keys(row, ["severity", "nodes", "via"]) || !levels.includes(row.severity) ||
          !Array.isArray(row.nodes) || !row.nodes.length || new Set(row.nodes).size !== row.nodes.length ||
          !row.nodes.every((path) => entry.packages[path]?.name === name) || !Array.isArray(row.via) || !row.via.length) fail("invalid_dependency_exception_policy");
      names.add(name);
      for (const via of row.via) {
        if (typeof via === "string") {
          if (!Object.hasOwn(entry.findings, via)) fail("invalid_dependency_exception_policy");
        } else {
          if (!keys(via, ["url", "name", "dependency", "severity"]) || via.url !== entry.advisory || via.name !== name ||
              via.dependency !== name || via.severity !== row.severity) fail("invalid_dependency_exception_policy");
          direct = true;
        }
      }
    }
    if (!direct || Object.entries(entry.packages).some(([path, pkg]) => !entry.findings[pkg.name]?.nodes.includes(path))) fail("invalid_dependency_exception_policy");
  }
}

// Resolve npm v3 package paths, including nested/scoped installs. No host modules are read.
function dependencyPath(packages, from, name) {
  let directory = from;
  while (true) {
    if (!directory.endsWith("node_modules")) {
      const path = `${directory ? `${directory}/` : ""}node_modules/${name}`;
      if (Object.hasOwn(packages, path)) return path;
    }
    if (!directory) return null;
    directory = directory.slice(0, Math.max(0, directory.lastIndexOf("/")));
  }
}

function dependencyGraph(lockBytes) {
  let lock;
  try { lock = JSON.parse(lockBytes.toString()); } catch { fail("invalid_dependency_lock"); }
  if (!object(lock) || lock.lockfileVersion !== 3 || !object(lock.packages) || !object(lock.packages[""])) fail("invalid_dependency_lock");
  const edges = [];
  for (const [path, pkg] of Object.entries(lock.packages)) {
    if ((path && !packagePath.test(path)) || !object(pkg) || pkg.link ||
        (pkg.dev !== undefined && typeof pkg.dev !== "boolean") ||
        kinds.some((kind) => pkg[kind] !== undefined && !strings(pkg[kind]))) fail("invalid_dependency_lock");
    for (const kind of kinds) {
      if (kind === "devDependencies" && path) continue;
      for (const [name, spec] of Object.entries(pkg[kind] ?? {})) {
        const target = dependencyPath(lock.packages, path, name);
        if (target) edges.push({ from: path, kind, name, spec, to: target });
      }
    }
  }
  const production = new Set([""]), outgoing = new Map();
  for (const edge of edges) {
    if (edge.kind === "devDependencies") continue;
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from).push(edge.to);
  }
  for (const path of production) for (const target of outgoing.get(path) ?? []) production.add(target);
  return { packages: lock.packages, edges, production };
}

function checkScope(entry, graph) {
  const approved = Object.keys(entry.packages), names = new Set(Object.values(entry.packages).map((pkg) => pkg.name));
  const occurrences = Object.entries(graph.packages).filter(([path, pkg]) => path &&
    (names.has(pkg.name) || names.has(path.split("node_modules/").at(-1)))).map(([path]) => path);
  if (!same([...approved].sort(), occurrences.sort())) fail("dependency_exception_scope_changed");
  for (const [path, expected] of Object.entries(entry.packages)) {
    const pkg = graph.packages[path];
    if (!pkg || pkg.dev !== true || pkg.devOptional || pkg.inBundle || graph.production.has(path) ||
        pkg.version !== expected.version || pkg.resolved !== expected.resolved || pkg.integrity !== expected.integrity ||
        (pkg.name !== undefined && pkg.name !== expected.name) ||
        !same(sorted(Object.entries(pkg.dependencies ?? {})), sorted(Object.entries(expected.dependencies))) ||
        Object.keys(pkg.optionalDependencies ?? {}).length || Object.keys(pkg.peerDependencies ?? {}).length) fail("dependency_exception_scope_changed");
  }
  if (!same(sorted(graph.edges.filter((edge) => Object.hasOwn(entry.packages, edge.to))), sorted(entry.edges))) fail("dependency_exception_scope_changed");
}

export function assessDependencyAudit(report, lockBytes, status, at = new Date(), policy = defaultPolicy) {
  validatePolicy(policy);
  if (![0, 1].includes(status) || !object(report) || report.error || report.auditReportVersion !== 2 ||
      !object(report.vulnerabilities) || !object(report.metadata?.vulnerabilities)) fail("invalid_dependency_audit_report");
  const entries = Object.entries(report.vulnerabilities), counts = report.metadata.vulnerabilities;
  if (![...levels, "total"].every((level) => Number.isSafeInteger(counts[level]) && counts[level] >= 0) ||
      counts.total !== entries.length || levels.reduce((sum, level) => sum + counts[level], 0) !== entries.length ||
      entries.some(([name, row]) => !object(row) || row.name !== name || !levels.includes(row.severity) ||
        !Array.isArray(row.via) || !row.via.length || !Array.isArray(row.nodes) || !row.nodes.length) ||
      levels.some((level) => entries.filter(([, row]) => row.severity === level).length !== counts[level])) fail("invalid_dependency_audit_report");
  if (!entries.length) {
    if (status !== 0) fail("dependency_audit_execution_failed");
    return { outcome: "clean", findings: 0, lock_sha256: createHash("sha256").update(lockBytes).digest("hex") };
  }
  if (status !== 1) fail("invalid_dependency_audit_report");
  const graph = dependencyGraph(lockBytes), accepted = new Map();
  for (const [name, row] of entries) {
    const entry = policy.exceptions.find((exception) => Object.hasOwn(exception.findings, name));
    if (!entry) fail("unapproved_dependency_finding");
    const expected = entry.findings[name];
    const via = row.via.map((value) => object(value) ? Object.fromEntries(["url", "name", "dependency", "severity"].map((key) => [key, value[key]])) : value);
    if (row.severity !== expected.severity || !same(sorted(row.nodes), sorted(expected.nodes)) || !same(sorted(via), sorted(expected.via))) fail("unapproved_dependency_finding");
    accepted.set(entry, (accepted.get(entry) ?? 0) + 1);
  }
  const time = at.getTime(), exceptions = [];
  for (const [entry, count] of accepted) {
    if (!Number.isFinite(time) || time < Date.parse(entry.not_before) || time >= Date.parse(entry.expires_at)) fail("dependency_exception_expired");
    if (count !== Object.keys(entry.findings).length) fail("unapproved_dependency_finding");
    checkScope(entry, graph);
    exceptions.push({ advisory: entry.advisory.split("/").at(-1), findings: count, expires_at: entry.expires_at });
  }
  return { outcome: "approved_exception", findings: entries.length, exceptions,
    lock_sha256: createHash("sha256").update(lockBytes).digest("hex") };
}

export function checkDependencies(root, run = spawnSync) {
  const web = resolve(root);
  const result = run("npm", ["audit", "--prefix", web, "--json", "--audit-level=low"],
    { encoding: "utf8", timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.signal || ![0, 1].includes(result.status)) fail("dependency_audit_execution_failed");
  let report;
  try { report = JSON.parse(result.stdout); } catch { fail("invalid_dependency_audit_report"); }
  const policy = JSON.parse(readFileSync(resolve(web, "scripts/dependency-exceptions.json")));
  return assessDependencyAudit(report, readFileSync(resolve(web, "package-lock.json")), result.status, new Date(), policy);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = checkDependencies(fileURLToPath(new URL("../", import.meta.url)));
    process.stdout.write(`${result.outcome === "clean" ? "Dependency audit clean" :
      `Dependency audit accepted with explicit temporary exception(s): ${result.exceptions.map((entry) => `${entry.advisory} (${entry.findings} findings; expires ${entry.expires_at})`).join(", ")}; ${result.findings} raw findings retained`}; lock sha256 ${result.lock_sha256}\n`);
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
