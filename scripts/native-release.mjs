import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, chmodSync } from "node:fs";
import { dirname, join, resolve, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { snapshot, verifySource, digest } from "./native-release-source.mjs";
import { command, environment, assertTarget, npmCommand, privateFile, smoke, waitListener } from "./native-release-system.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const messages = JSON.parse(readFileSync(join(root, "apps/web/messages/en.json"), "utf8")).nativeRelease;
const service = "tinywarden.service";
const jobs = ["tinywarden-retention", "tinywarden-notifications"];

export function releaseOptions(args) {
  const [mode, ...rest] = args;
  if (!["snapshot", "plan", "apply", "agent-package"].includes(mode)) throw new Error("usage");
  const options = { mode };
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i]?.replace(/^--/, "");
    if (!rest[i]?.startsWith("--") || !rest[i + 1] || options[key] !== undefined ||
      !["release", "output", "scope", "expected-database", "backup", "cookie-file", "binary"].includes(key)) {
      throw new Error("usage");
    }
    options[key] = rest[i + 1];
  }
  const permitted = { snapshot: ["output"], "agent-package": ["release", "output", "binary"],
    plan: ["release", "scope", "expected-database"],
    apply: ["release", "scope", "expected-database", "backup", "cookie-file"] }[mode];
  for (const key of Object.keys(options)) if (key !== "mode" && !permitted.includes(key)) throw new Error("usage");
  const required = permitted.filter((key) => key !== "cookie-file");
  if (required.some((key) => !options[key])) throw new Error("usage");
  if (["plan", "apply"].includes(mode)) {
    const scope = options.scope.split(",");
    if (new Set(scope).size !== scope.length || scope.some((key) => !["web", "schema", "dependencies"].includes(key)) ||
        scope.includes("dependencies") && !scope.includes("web")) throw new Error("invalid_scope");
    options.changes = Object.fromEntries(scope.map((key) => [key, true]));
    if (mode === "apply" && !options["cookie-file"]) throw new Error("missing_authenticated_smoke");
  }
  return options;
}

export function planRelease(rootPath, options, run = command) {
  const release = JSON.parse(readFileSync(options.release, "utf8"));
  verifySource(rootPath, release);
  const web = join(rootPath, "apps/web");
  const env = environment(join(web, ".env.production.local"), options["expected-database"]);
  if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("wrong_node_version");
  assertTarget(run, env, options["expected-database"]);
  const workingDirectory = run("systemctl", ["--user", "show", "--property=WorkingDirectory", "--value", service], { env, timeout: 5000 });
  if (workingDirectory !== web) throw new Error("service_checkout_mismatch");
  if (options.changes.schema && !/^pg_dump \(PostgreSQL\) 18\./.test(run("pg_dump", ["--version"], { env, timeout: 5000 }))) {
    throw new Error("wrong_postgresql_tools");
  }
  const npm = npmCommand(run, env);
  const unit = readFileSync(join(rootPath, "infra/systemd/tinywarden.service"), "utf8");
  if (!unit.includes(`WorkingDirectory=${web}\n`)) throw new Error("unit_checkout_mismatch");
  const steps = ["quiesce_jobs", "stop_web", "preserve_web"];
  if (options.changes.schema) steps.push("dump_database");
  if (options.changes.dependencies) steps.push("install_dependencies");
  if (options.changes.schema) steps.push("migrate_once", "verify_ledger");
  if (options.changes.web) steps.push("build_web");
  steps.push("link_unit", "start_web", "authenticated_smoke", "resume_existing_timers");
  return { release, web, env, npm, steps };
}

export async function executeRelease(rootPath, options, dependencies = {}) {
  const run = dependencies.run ?? command;
  const check = dependencies.smoke ?? smoke;
  const listener = dependencies.waitListener ?? waitListener;
  const context = planRelease(rootPath, options, run);
  const backup = options.backup;
  if (!isAbsolute(backup) || resolve(backup) === resolve(rootPath) ||
      resolve(backup).startsWith(`${resolve(rootPath)}/`)) throw new Error("backup_location");
  const cookie = privateFile(options["cookie-file"]).trim();
  if (!cookie || cookie.includes("\n") || cookie.includes("\r")) throw new Error("invalid_cookie_file");
  const lock = join(rootPath, ".git/tinywarden-release.lock");
  mkdirSync(lock, { mode: 0o700 }); // Never steal a lock left by an interrupted operation.
  let record;
  const persist = () => writeFileSync(join(backup, "release.json"), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  const active = (name) => {
    const state = run("systemctl", ["--user", "show", "--property=ActiveState", "--value", name], { env: context.env, timeout: 5000 });
    return ["active", "activating", "deactivating", "reloading"].includes(state);
  };
  const control = (...args) => run("systemctl", ["--user", ...args], { env: context.env });
  let stopped = false, startAttempted = false;
  try {
    mkdirSync(backup, { mode: 0o700 }); // Existing backup paths are never overwritten.
    record = { sourceTree: context.release.sourceTree, scope: options.scope,
      expectedDatabase: options["expected-database"], startedAt: new Date().toISOString(),
      steps: [], phase: "quiesce_jobs", outcome: "in_progress", previouslyActiveTimers: [] };
    persist();
    for (const name of jobs) {
      if (active(`${name}.timer`)) { record.previouslyActiveTimers.push(`${name}.timer`); persist(); control("stop", `${name}.timer`); }
    }
    const deadline = performance.now() + 240_000;
    while (jobs.some((name) => active(`${name}.service`))) {
      if (performance.now() >= deadline) throw new Error("job_drain_timeout");
      await delay(500);
    }
    const step = (name, action) => {
      record.phase = name; persist(); action(); record.steps.push(name); persist();
    };
    step("stop_web", () => { control("stop", service); stopped = true; });
    step("preserve_web", () => {
      const paths = [".next", "package-lock.json"];
      if (options.changes.dependencies) paths.push("node_modules");
      const present = paths.filter((name) => existsSync(join(context.web, name)));
      run("tar", ["-czf", join(backup, "web-before.tar.gz"), "-C", context.web, ...present], { env: context.env });
      chmodSync(join(backup, "web-before.tar.gz"), 0o600);
      writeFileSync(join(backup, "environment-before"), privateFile(join(context.web, ".env.production.local")), { mode: 0o600 });
    });
    if (options.changes.schema) step("dump_database", () => {
      const file = join(backup, "database.dump");
      run("pg_dump", ["--format=custom", "--file", file], { env: context.env });
      chmodSync(file, 0o600);
      run("pg_restore", ["--list", file], { env: context.env, timeout: 10_000 });
    });
    if (options.changes.dependencies) step("install_dependencies", () => context.npm(
      ["ci", "--include=dev", "--no-audit", "--no-fund"], { cwd: context.web, timeout: 300_000 }));
    if (options.changes.schema) {
      step("migrate_once", () => run(process.execPath,
        ["--import", "tsx", "server/db/migrate.ts", options["expected-database"]], { cwd: context.web, env: context.env, timeout: 30_000 }));
      step("verify_ledger", () => {
        const expected = readdirSync(join(context.web, "server/db/migrations")).filter((name) => name.endsWith(".ts"))
          .sort().map((name) => name.slice(0, -3)).join("\n");
        const found = run("psql", ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c",
          "SELECT name FROM tinywarden.kysely_migration ORDER BY name"], { env: context.env, timeout: 10_000 });
        if (found !== expected) throw new Error("migration_ledger_mismatch");
      });
    }
    if (options.changes.web) step("build_web", () => context.npm(["run", "build"], { cwd: context.web, timeout: 300_000 }));
    verifySource(rootPath, context.release);
    step("link_unit", () => {
      control("link", join(rootPath, "infra/systemd/tinywarden.service"));
      control("daemon-reload"); control("enable", service);
    });
    step("start_web", () => { startAttempted = true; control("start", service);
      if (!active(service)) throw new Error("service_not_active"); });
    record.phase = "authenticated_smoke"; persist();
    await listener(context.env);
    await check(context.env, options["cookie-file"]);
    record.steps.push("authenticated_smoke");
    step("resume_existing_timers", () => {
      for (const name of record.previouslyActiveTimers) control("start", name);
    });
    record.outcome = "complete"; record.finishedAt = new Date().toISOString(); persist();
    return record;
  } catch (error) {
    if (record) record.cleanup = [];
    const stopForCleanup = (unit) => {
      let outcome = "stopped";
      try { control("stop", unit); } catch { outcome = "stop_unconfirmed"; }
      record.cleanup.push({ unit, outcome });
    };
    for (const name of record?.previouslyActiveTimers ?? []) stopForCleanup(name);
    // A failed command can follow a successful start side effect.
    if (stopped && startAttempted) stopForCleanup(service);
    if (record) { record.outcome = "failed"; record.finishedAt = new Date().toISOString(); persist(); }
    throw error;
  } finally { rmSync(lock, { recursive: true }); }
}

export function packageAgent(rootPath, options) {
  const release = JSON.parse(readFileSync(options.release, "utf8")); verifySource(rootPath, release);
  if (!isAbsolute(options.output) || existsSync(options.output) || existsSync(`${options.output}.json`)) throw new Error("package_location");
  const metadata = { sourceTree: release.sourceTree, binarySha256: digest(readFileSync(options.binary)),
    unitSha256: digest(readFileSync(join(rootPath, "infra/systemd/tinywarden-agent.service"))) };
  command("tar", ["-czf", options.output, "-C", dirname(resolve(options.binary)), resolve(options.binary).split("/").at(-1),
    "-C", rootPath, "infra/systemd/tinywarden-agent.service", "docs/deploy/native.md", "LICENSE", "agent/THIRD_PARTY_NOTICES.md"]);
  chmodSync(options.output, 0o600);
  writeFileSync(`${options.output}.json`, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  return metadata;
}

async function main() {
  process.umask(0o077);
  const options = releaseOptions(process.argv.slice(2));
  if (options.mode === "snapshot") {
    const release = snapshot(root, options.output);
    process.stdout.write(`${JSON.stringify({ sourceTree: release.sourceTree, files: release.files.length })}\n`);
  } else if (options.mode === "plan") {
    const plan = planRelease(root, options);
    process.stdout.write(`${JSON.stringify({ sourceTree: plan.release.sourceTree, steps: plan.steps })}\n`);
  } else if (options.mode === "agent-package") {
    process.stdout.write(`${JSON.stringify(packageAgent(root, options))}\n`);
  } else {
    const result = await executeRelease(root, options);
    process.stdout.write(`${messages.complete}\n${JSON.stringify({ sourceTree: result.sourceTree, steps: result.steps })}\n`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { process.stderr.write(`${messages.failed}\n`); process.exitCode = 1; });
}
