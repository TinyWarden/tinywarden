import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { Linter } from "eslint";

const require = createRequire(import.meta.url);
const next = require("@next/eslint-plugin-next");
const pluginRequire = createRequire(require.resolve("@next/eslint-plugin-next/package.json"));
const { getRootDirs } = pluginRequire("./dist/utils/get-root-dirs.js");
const adapter = pluginRequire("fast-glob");

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "tw-next-roots-")), previous = process.cwd();
  try {
    for (const directory of ["pages", "apps/a/pages/nested", "apps/a/deep/site/pages", "apps/b/pages", "apps/b/app", "apps/.hidden/pages"])
      mkdirSync(join(root, directory), { recursive: true });
    writeFileSync(join(root, "pages/root.js"), "export default function Root() {}\n");
    writeFileSync(join(root, "apps/a/pages/dashboard.js"), "export default function Dashboard() {}\n");
    writeFileSync(join(root, "apps/not-a-directory"), "file");
    symlinkSync(join(root, "apps/a"), join(root, "linked"), "junction");
    process.chdir(root);
    run(root);
  } finally { process.chdir(previous); rmSync(root, { recursive: true, force: true }); }
}

test("installed Next dependency is the packed adapter, with the vulnerable chain absent", () => {
  assert.equal(pluginRequire("fast-glob/package.json").name, "@tinywarden/next-eslint-glob");
  assert.equal(pluginRequire("fast-glob/package.json").version, "1.0.0");
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url)));
  const identities = Object.entries(lock.packages).map(([path, pkg]) => pkg.name ?? path.split("node_modules/").at(-1));
  for (const name of ["braces", "micromatch", "fast-glob"]) assert.equal(identities.includes(name), false, name);
  assert.equal(lock.packages["node_modules/fast-glob"].link, undefined);
});

test("preserves literal, wildcard, recursive, brace, class, array and symlink roots", () => fixture((root) => {
  const descendants = ["apps/a", "apps/a/deep", "apps/a/deep/site", "apps/a/deep/site/pages", "apps/a/pages", "apps/a/pages/nested", "apps/b", "apps/b/app", "apps/b/pages"];
  const cases = [
    ["apps/a", ["apps/a"]], ["apps/*", ["apps/a", "apps/b"]], ["apps/{a,b}", ["apps/a", "apps/b"]],
    ["apps/**", descendants], ["apps/?", ["apps/a", "apps/b"]], ["apps/[ab]", ["apps/a", "apps/b"]],
    ["apps/a/", ["apps/a/"]], ["./apps/a", ["./apps/a"]],
    [join(root, "apps/*"), [join(root, "apps/a"), join(root, "apps/b")]],
    ["missing*", []], ["linked", ["linked"]], ["apps/.hidden", ["apps/.hidden"]],
    [["apps/a", "apps/b"], ["apps/a", "apps/b"]], [["apps/a", null, 12], ["apps/a"]],
  ];
  for (const [rootDir, expected] of cases)
    assert.deepEqual(getRootDirs({ cwd: root, settings: { next: { rootDir } } }).sort(), [...expected].sort(), JSON.stringify(rootDir));
  assert.deepEqual(getRootDirs({ cwd: root, settings: {} }), [root]);
  assert.deepEqual(getRootDirs({ cwd: root, settings: { next: { rootDir: "apps\\a" } } }), ["apps/a"]);
}));

test("the real Next route rule still rejects internal anchors and accepts Link/external links", () => fixture((root) => {
  const lint = (rootDir, jsx) => new Linter().verify(`export default function Page() { return ${jsx}; }`, [{
    files: ["**/*.jsx"], languageOptions: { ecmaVersion: 2022, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { "@next/next": next }, rules: { "@next/next/no-html-link-for-pages": "error" },
    settings: { next: { rootDir } },
  }], { filename: join(root, "probe.jsx") });
  for (const roots of ["apps/a", "apps/*", "apps/{a,b}", ["apps/a", "apps/b"], "linked"]) {
    const errors = lint(roots, '<a href="/dashboard">Dashboard</a>');
    assert.equal(errors.length, 1, JSON.stringify(roots));
    assert.equal(errors[0].ruleId, "@next/next/no-html-link-for-pages");
    assert.equal(lint(roots, '<Link href="/dashboard">Dashboard</Link>').length, 0);
    assert.equal(lint(roots, '<a href="https://example.test">External</a>').length, 0);
  }
}));

test("deep brace inputs cannot reach the removed recursive walker", () => {
  const script = `const {createRequire}=require('node:module');const r=createRequire(${JSON.stringify(require.resolve("@next/eslint-plugin-next/package.json"))});
    const {getRootDirs}=r('./dist/utils/get-root-dirs.js');
    for(const middle of ['a','a,b']) {try {getRootDirs({cwd:process.cwd(),settings:{next:{rootDir:'{'.repeat(4500)+middle+'}'.repeat(4500)}}});}
    catch(e) {if(e instanceof RangeError) throw e;if(!['ENOENT','ENAMETOOLONG','EINVAL'].includes(e.code) && !(e instanceof SyntaxError)) throw e;}}`;
  const result = spawnSync(process.execPath, ["-e", script], { cwd: tmpdir(), encoding: "utf8", timeout: 5000 });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
});

test("unexpected future fast-glob call shapes fail instead of silently weakening a lint rule", () => {
  for (const options of [undefined, {}, { onlyDirectories: false }, { onlyDirectories: true, cwd: "/" }])
    assert.throws(() => adapter.globSync("*", options), /unsupported_next_eslint_glob_options/);
  assert.throws(() => adapter.globSync("", { onlyDirectories: true }), /unsupported_next_eslint_glob_options/);
});
