import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, lstatSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, isAbsolute } from "node:path";

export const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (root, args, env = process.env) => execFileSync("git", args,
  { cwd: root, env, encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] }).trim();
const inventory = (root) => git(root, ["ls-files", "-z"]).split("\0").filter(Boolean)
  .filter((name) => !name.endsWith(".md")).sort();

export function sourceFiles(root, names = inventory(root)) {
  return names.map((name) => {
    if (!name || isAbsolute(name) || name.split("/").includes("..") || name.includes("\\")) {
      throw new Error("invalid_source_path");
    }
    const file = join(root, name);
    if (!lstatSync(file).isFile()) throw new Error("source_not_regular_file");
    return { path: name, sha256: digest(readFileSync(file)) };
  });
}

export function snapshot(root, output) {
  if (!isAbsolute(output) || resolve(output).startsWith(`${resolve(root)}/`)) throw new Error("snapshot_location");
  const directory = mkdtempSync(join(tmpdir(), "tinywarden-source-"));
  try {
    const env = { ...process.env, GIT_INDEX_FILE: join(directory, "index") };
    let base = "--empty";
    try { base = git(root, ["rev-parse", "--verify", "HEAD"], env); } catch { /* New, initialized source repository. */ }
    git(root, ["read-tree", base], env);
    git(root, ["add", "--all"], env);
    const tree = git(root, ["write-tree"], env);
    const files = sourceFiles(root);
    const release = { version: 1, sourceTree: tree, files };
    writeFileSync(output, `${JSON.stringify(release, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    return release;
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

export function verifySource(root, release) {
  if (release.version !== 1 || !/^[a-f0-9]{40}$/.test(release.sourceTree) || !Array.isArray(release.files)) {
    throw new Error("invalid_release_snapshot");
  }
  if (git(root, ["cat-file", "-t", release.sourceTree]) !== "tree") throw new Error("missing_source_tree");
  // Unknown, non-ignored source could be consumed by the build without being reviewed.
  if (git(root, ["ls-files", "--others", "--exclude-standard"])) throw new Error("untracked_release_files");
  const current = sourceFiles(root);
  if (JSON.stringify(current) !== JSON.stringify(release.files)) throw new Error("source_changed");
  const archived = git(root, ["ls-tree", "-r", "--name-only", release.sourceTree]).split("\n")
    .filter((name) => name && !name.endsWith(".md")).sort();
  if (JSON.stringify(archived) !== JSON.stringify(current.map((file) => file.path))) throw new Error("tree_inventory_changed");
  for (const file of current) {
    const bytes = execFileSync("git", ["show", `${release.sourceTree}:${file.path}`],
      { cwd: root, timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] });
    if (digest(bytes) !== file.sha256) throw new Error("tree_content_changed");
  }
  return current.length;
}
