import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, chmodSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { snapshot, verifySource } from "./native-release-source.mjs";
import { command, connectionEnv, privateFile, assertTarget, smoke } from "./native-release-system.mjs";
import { executeRelease, releaseOptions } from "./native-release.mjs";

function fixture() {
  const base = mkdtempSync(join(tmpdir(), "tinywarden-native-test-")), root = join(base, "source");
  mkdirSync(root); execFileSync("git", ["init", "--quiet", root]);
  const write = (name, value, mode = 0o600) => {
    mkdirSync(join(root, name, ".."), { recursive: true }); writeFileSync(join(root, name), value, { mode });
  };
  write(".gitignore", ".env*\nnode_modules/\n.next/\n");
  write("apps/web/package-lock.json", "{}\n");
  write("apps/web/.next/original", "previous artifact\n");
  write("apps/web/node_modules/original", "previous dependencies\n");
  write("apps/web/server/db/migrations/001_fixture.ts", "export {}\n");
  write("infra/systemd/tinywarden.service", `WorkingDirectory=${join(root, "apps/web")}\n`);
  write("apps/web/.env.production.local", "DATABASE_URL=postgresql://tinywarden:synthetic@localhost/tinywarden_test_p1b?host=/var/run/postgresql\nPUBLIC_ORIGIN=https://example.invalid\nPORT=10007\n");
  execFileSync("git", ["-C", root, "add", "--all"]);
  const release = join(base, "release.json"); snapshot(root, release);
  const cookie = join(base, "cookie"); writeFileSync(cookie, "__Host-tinywarden_session=synthetic", { mode: 0o600 });
  const options = releaseOptions(["apply", "--release", release, "--scope", "web,schema,dependencies",
    "--expected-database", "tinywarden_test_p1b", "--backup", join(base, "backup"), "--cookie-file", cookie]);
  return { base, root, options, write, close: () => rmSync(base, { recursive: true, force: true }) };
}

function driver(f, fail) {
  const calls = [], timers = new Set(["tinywarden-retention.timer"]);
  let web = true, buildDependencies = true;
  const run = (program, args, options) => {
    calls.push({ program, args });
    if (program === "psql") return args.at(-1).startsWith("SELECT current_database")
      ? "tinywarden_test_p1b|tinywarden|tinywarden|tinywarden|tinywarden" : "001_fixture";
    if (args.includes("--version")) return program === "pg_dump" ? "pg_dump (PostgreSQL) 18.6" : "11.16.0";
    if (program === "tar") return command(program, args, options);
    if (program === "pg_dump") { writeFileSync(join(f.options.backup, "database.dump"), "synthetic archive"); return ""; }
    if (program === "systemctl") {
      const [, action, name] = args;
      if (action === "show" && args.includes("--property=WorkingDirectory")) return join(f.root, "apps/web");
      if (action === "show") return args.at(-1) === "tinywarden.service" ? web ? "active" : "inactive" : timers.has(args.at(-1)) ? "active" : "inactive";
      if (action === "stop") { if (name === "tinywarden.service") web = false; else timers.delete(name); }
      if (action === "start") { if (name === "tinywarden.service") web = true; else timers.add(name); }
      return "";
    }
    if (args.includes("ci")) {
      buildDependencies = options.env.NODE_ENV !== "production" || args.includes("--include=dev");
    }
    if (args.includes("build") && !buildDependencies) throw new Error("synthetic_postcss_missing");
    if (fail && args.includes(fail)) throw new Error("synthetic_failure");
    return "";
  };
  return { run, calls, webActive: () => web, timers };
}

test("release scope and authority inputs reject ambiguous or missing operations", () => {
  for (const args of [[], ["apply"], ["snapshot", "--output", "/tmp/x", "--scope", "web"],
    ["plan", "--release", "x", "--scope", "dependencies", "--expected-database", "tinywarden"],
    ["plan", "--release", "x", "--scope", "web,web", "--expected-database", "tinywarden"],
    ["apply", "--release", "x", "--scope", "web", "--expected-database", "tinywarden", "--backup", "/tmp/b"]]) {
    assert.throws(() => releaseOptions(args));
  }
});

test("accepted snapshot rejects changed, additional, missing and tree-mismatched runtime source", () => {
  const f = fixture();
  try {
    const release = JSON.parse(readFileSync(f.options.release));
    assert.equal(verifySource(f.root, release), 4);
    f.write("notes.md", "documentation only");
    execFileSync("git", ["-C", f.root, "add", "notes.md"]);
    assert.equal(verifySource(f.root, release), 4);
    f.write("extra.ts", "export {}\n");
    assert.throws(() => verifySource(f.root, release), /untracked_release_files/);
    rmSync(join(f.root, "extra.ts"));
    f.write("apps/web/package-lock.json", "changed");
    assert.throws(() => verifySource(f.root, release), /source_changed/);
    f.write("apps/web/package-lock.json", "{}\n");
    const incorrect = structuredClone(release); incorrect.files[0].sha256 = "0".repeat(64);
    assert.throws(() => verifySource(f.root, incorrect), /source_changed/);
    rmSync(join(f.root, "apps/web/package-lock.json"));
    assert.throws(() => verifySource(f.root, release));
  } finally { f.close(); }
});

test("scoped release preserves private recovery material, migrates once and resumes only existing timers", async () => {
  const f = fixture();
  try {
    const d = driver(f);
    const result = await executeRelease(f.root, f.options, { run: d.run, waitListener: async () => {}, smoke: async () => {} });
    assert.equal(result.outcome, "complete"); assert.equal(d.webActive(), true);
    assert.deepEqual([...d.timers], ["tinywarden-retention.timer"]);
    assert.equal(d.calls.filter((call) => call.args.includes("server/db/migrate.ts")).length, 1);
    assert.equal(d.calls.some((call) => call.args.includes("pg_restore")), false);
    for (const file of ["database.dump", "web-before.tar.gz", "environment-before", "release.json"]) {
      assert.equal(statSync(join(f.options.backup, file)).mode & 0o777, 0o600);
    }
    const record = readFileSync(join(f.options.backup, "release.json"), "utf8");
    assert.equal(record.includes("synthetic"), false);
    assert.equal(statSync(f.options.backup).mode & 0o777, 0o700);
    const archive = command("tar", ["-tzf", join(f.options.backup, "web-before.tar.gz")]);
    assert.match(archive, /\.next\/original/); assert.match(archive, /node_modules\/original/);
  } finally { f.close(); }
});

test("build and smoke failures stop serving, pause jobs and never restore or repeat migrations", async () => {
  for (const failure of ["build", "smoke"]) {
    const f = fixture();
    try {
      const d = driver(f, failure === "build" ? "build" : undefined);
      await assert.rejects(executeRelease(f.root, f.options, { run: d.run, waitListener: async () => {},
        smoke: async () => { throw new Error("synthetic_smoke_failure"); } }));
      assert.equal(d.webActive(), false); assert.equal(d.timers.size, 0);
      assert.equal(d.calls.filter((call) => call.args.includes("server/db/migrate.ts")).length, 1);
      assert.equal(d.calls.some((call) => call.program === "pg_restore" && !call.args.includes("--list")), false);
      const record = JSON.parse(readFileSync(join(f.options.backup, "release.json")));
      assert.equal(record.outcome, "failed");
      assert.equal(record.phase, failure === "build" ? "build_web" : "authenticated_smoke");
    } finally { f.close(); }
  }
});

test("a start side effect followed by a command error is stopped without restarting or restoring", async () => {
  const f = fixture();
  try {
    const d = driver(f);
    const run = (program, args, options) => {
      const result = d.run(program, args, options);
      if (program === "systemctl" && args.includes("start") && args.at(-1) === "tinywarden.service") {
        throw new Error("synthetic_start_reply_lost");
      }
      return result;
    };
    await assert.rejects(executeRelease(f.root, f.options, { run, waitListener: async () => {}, smoke: async () => {} }));
    assert.equal(d.webActive(), false); assert.equal(d.timers.size, 0);
    assert.equal(d.calls.filter((call) => call.program === "systemctl" && call.args.includes("start") && call.args.at(-1) === "tinywarden.service").length, 1);
    assert.equal(d.calls.filter((call) => call.args.includes("server/db/migrate.ts")).length, 1);
    assert.equal(d.calls.some((call) => call.program === "pg_restore" && !call.args.includes("--list")), false);
    const record = JSON.parse(readFileSync(join(f.options.backup, "release.json")));
    assert.equal(record.phase, "start_web"); assert.equal(record.outcome, "failed");
    assert.deepEqual(record.cleanup.find((entry) => entry.unit === "tinywarden.service"),
      { unit: "tinywarden.service", outcome: "stopped" });
  } finally { f.close(); }
});

test("unconfirmed web and timer cleanup stops remain visible without exposing command diagnostics", async () => {
  for (const failedUnit of ["tinywarden.service", "tinywarden-retention.timer"]) {
    const f = fixture();
    try {
      const d = driver(f); let startAttempted = false;
      const run = (program, args, options) => {
        if (program === "systemctl" && args.includes("stop") && args.at(-1) === failedUnit && startAttempted) {
          throw new Error("synthetic_private_diagnostic");
        }
        const result = d.run(program, args, options);
        if (program === "systemctl" && args.includes("start") && args.at(-1) === "tinywarden.service") {
          startAttempted = true; throw new Error("synthetic_start_reply_lost");
        }
        return result;
      };
      await assert.rejects(executeRelease(f.root, f.options, { run, waitListener: async () => {}, smoke: async () => {} }));
      const text = readFileSync(join(f.options.backup, "release.json"), "utf8"), record = JSON.parse(text);
      assert.equal(record.outcome, "failed"); assert.equal(record.phase, "start_web");
      assert.deepEqual(record.cleanup.find((entry) => entry.unit === failedUnit), { unit: failedUnit, outcome: "stop_unconfirmed" });
      assert.equal(text.includes("synthetic_private_diagnostic"), false);
      assert.equal(d.webActive(), failedUnit === "tinywarden.service");
    } finally { f.close(); }
  }
});

test("database-only scope skips dependency install and build; duplicate release lock prevents stopping services", async () => {
  const f = fixture();
  try {
    f.options.changes = { schema: true }; f.options.scope = "schema";
    const d = driver(f); mkdirSync(join(f.root, ".git/tinywarden-release.lock"));
    await assert.rejects(executeRelease(f.root, f.options, { run: d.run, waitListener: async () => {}, smoke: async () => {} }));
    assert.equal(d.calls.some((call) => call.args.includes("stop")), false);
    rmSync(join(f.root, ".git/tinywarden-release.lock"), { recursive: true });
    await executeRelease(f.root, f.options, { run: d.run, waitListener: async () => {}, smoke: async () => {} });
    assert.equal(d.calls.some((call) => call.args.includes("ci") || call.args.includes("build")), false);
  } finally { f.close(); }
});

test("connection guard preserves Unix socket override and rejects wrong role/database; files must be private", () => {
  const env = connectionEnv("postgresql://tinywarden:synthetic@localhost/tinywarden_test_p1b?host=/var/run/postgresql", "tinywarden_test_p1b");
  assert.equal(env.PGHOST, "/var/run/postgresql"); assert.equal(env.PGPASSWORD, "synthetic");
  for (const url of ["postgresql://other@localhost/tinywarden_test_p1b", "postgresql://tinywarden@localhost/tinywarden"]) {
    assert.throws(() => connectionEnv(url, "tinywarden_test_p1b"), /wrong_database/);
  }
  const f = fixture();
  try { chmodSync(f.options["cookie-file"], 0o644); assert.throws(() => privateFile(f.options["cookie-file"])); }
  finally { f.close(); }
  assert.throws(() => assertTarget(() => "tinywarden|tinywarden|tinywarden|other|tinywarden", {}, "tinywarden"));
});

test("an activating oneshot drains before web is stopped", async () => {
  const f = fixture();
  try {
    const d = driver(f); let running = true, checked = false;
    const start = performance.now();
    const run = (program, args, options) => {
      if (program === "systemctl" && args.includes("--property=ActiveState") && args.at(-1) === "tinywarden-notifications.service") {
        running = performance.now() - start < 50; checked = true; return running ? "activating" : "inactive";
      }
      if (program === "systemctl" && args.includes("stop") && args.at(-1) === "tinywarden.service") {
        assert.equal(checked, true); assert.equal(running, false);
      }
      return d.run(program, args, options);
    };
    await executeRelease(f.root, f.options, { run, waitListener: async () => {}, smoke: async () => {} });
  } finally { f.close(); }
});

test("authenticated smoke refuses redirects and never sends the cookie to the public login check", async () => {
  const f = fixture(), calls = [];
  try {
    await smoke({ PUBLIC_ORIGIN: "https://example.invalid" }, f.options["cookie-file"], async (url, options) => {
      calls.push({ url, options }); return { status: 200 };
    });
    assert.deepEqual(calls[0].options.headers, {});
    assert.match(calls[1].url, /\/api\/v1\/operator\/hosts$/);
    assert.equal(calls[1].options.redirect, "manual");
    await assert.rejects(smoke({ PUBLIC_ORIGIN: "https://example.invalid" }, f.options["cookie-file"], async () => ({ status: 302 })));
  } finally { f.close(); }
});

test("existing PostgreSQL target produces a readable private dump without a new cluster or role", { skip: !process.env.TW_TEST_DATABASE_URL }, () => {
  const directory = mkdtempSync(join(tmpdir(), "tinywarden-native-pg-"));
  try {
    const env = { ...process.env, ...connectionEnv(process.env.TW_TEST_DATABASE_URL, "tinywarden_test_p1b") };
    assertTarget(command, env, "tinywarden_test_p1b");
    const file = join(directory, "synthetic.dump");
    command("pg_dump", ["--format=custom", "--file", file], { env }); chmodSync(file, 0o600);
    assert.match(command("pg_restore", ["--list", file], { env }), /DATABASE|SCHEMA/);
    assert.equal(statSync(file).mode & 0o777, 0o600);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
