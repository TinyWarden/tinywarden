import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = join(root, "tests/fixtures/agent");
const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--source" || !isAbsolute(args[1]))) throw new Error("usage: [--source absolute-agent-checkout]");
if (manifest.schema_version !== 1 || manifest.repository !== "TinyWarden/tinywarden-agent" ||
    !/^[a-f0-9]{40}$/.test(manifest.revision) || !Array.isArray(manifest.files)) throw new Error("invalid_fixture_manifest");
const actual = [];
function inventory(path, prefix = "") {
  for (const name of readdirSync(path)) {
    const file = join(path, name), relative = prefix + name, stat = lstatSync(file);
    if (stat.isDirectory()) inventory(file, relative + "/");
    else if (stat.isFile()) { if (relative !== "manifest.json") actual.push(relative); }
    else throw new Error("fixture_not_regular_file");
  }
}
inventory(directory);
const names = manifest.files.map((file) => file.path);
if (new Set(names).size !== names.length || JSON.stringify(names) !== JSON.stringify(actual.sort())) throw new Error("fixture_inventory_mismatch");
for (const file of manifest.files) {
  if (!/^internal\/(agent|baseline)\/testdata\/[a-z0-9_./-]+\.json$/.test(file.path) ||
      file.path.split("/").includes("..") || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error("invalid_fixture_entry");
  const bytes = readFileSync(join(directory, file.path));
  if (createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw new Error("fixture_digest_mismatch: " + file.path);
  if (args.length) {
    const canonical = execFileSync("git", ["-C", args[1], "show", `${manifest.revision}:${file.path}`], { stdio: ["ignore", "pipe", "pipe"] });
    if (!canonical.equals(bytes)) throw new Error("fixture_source_mismatch: " + file.path);
  }
}
console.log(`Pinned agent examples verified: ${names.length} files at ${manifest.revision}`);
