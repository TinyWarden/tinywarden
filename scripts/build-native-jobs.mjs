import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, cpSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const web = resolve(root);
const requireWeb = createRequire(join(web, "package.json"));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (...args) => execFileSync("git", args, { cwd: root, maxBuffer: 32 * 1024 * 1024 });

export async function buildNativeJobs(revision, output) {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("exact_revision_required");
  const kind = git("cat-file", "-t", revision).toString().trim();
  if (!["commit", "tree"].includes(kind)) throw new Error("wrong_revision");
  const sourceTree = git("rev-parse", `${revision}^{tree}`).toString().trim();
  const directory = resolve(output);
  if (!directory.startsWith(join(web, "dist/native-jobs/"))) throw new Error("job_artifact_location");
  mkdirSync(join(web, "dist/native-jobs"), { recursive: true, mode: 0o700 });
  mkdirSync(directory, { mode: 0o700 }); // Never overwrite an accepted artifact.
  const source = join(directory, ".source");
  mkdirSync(source, { mode: 0o700 });
  const roots = ["scripts", "server", "messages", "package-lock.json"];
  if (git("ls-tree", "--name-only", revision, "lib").toString().trim() === "lib") roots.push("lib");
  if (git("ls-tree", "--name-only", revision, "runtime").toString().trim() === "runtime") roots.push("runtime");
  const archive = git("archive", "--format=tar", revision, ...roots);
  execFileSync("tar", ["-x", "-C", source], { input: archive, maxBuffer: 1024 * 1024 });
  const sourceWeb = source;
  const esbuild = requireWeb("esbuild");
  const lockfile = readFileSync(join(sourceWeb, "package-lock.json"));
  if (JSON.parse(lockfile).packages["node_modules/esbuild"]?.version !== esbuild.version) {
    throw new Error("job_build_tool_version_mismatch");
  }
  const entryPoints = { notifications: "scripts/notifications.ts", retention: "scripts/retention.ts",
    ...(existsSync(join(sourceWeb, "scripts/history.ts")) ? { history: "scripts/history.ts" } : {}) };
  const result = await esbuild.build({
    absWorkingDir: sourceWeb,
    entryPoints,
    outdir: directory, outExtension: { ".js": ".mjs" }, bundle: true, packages: "external",
    platform: "node", target: "node24", format: "esm", metafile: true, write: true,
    logLevel: "silent", legalComments: "inline",
  });
  const inputs = Object.keys(result.metafile.inputs).sort().map((name) => {
    const path = resolve(sourceWeb, name);
    if (!path.startsWith(`${sourceWeb}/`)) throw new Error("mutable_source_dependency");
    return { path: relative(sourceWeb, path), sha256: digest(readFileSync(path)) };
  });
  if(existsSync(join(source,"runtime/skills/artifact.json"))){
    const runtime=JSON.parse(readFileSync(join(source,"runtime/skills/artifact.json"),"utf8"));
    for(const [name,hash] of Object.entries(runtime.files)){
      if(!/^[A-Za-z0-9_./-]+$/.test(name)||name.split("/").some((p)=>p===".."||p===""))throw new Error("invalid_runtime_asset");
      const file=join("runtime/skills",name),sha256=digest(readFileSync(join(source,file)));
      if(sha256!==hash)throw new Error("runtime_asset_changed");
      inputs.push({path:file,sha256});
    }
    inputs.push({path:"runtime/skills/artifact.json",sha256:digest(readFileSync(join(source,"runtime/skills/artifact.json")))});
    cpSync(join(source,"runtime"),join(directory,"runtime"),{recursive:true});
  }
  const dependencies = new Map();
  const outputs = Object.entries(result.metafile.outputs).map(([name, metadata]) => {
    for (const imported of metadata.imports) {
      if (!imported.external || imported.path.startsWith(".") || imported.path.startsWith("/")) {
        throw new Error("mutable_application_import");
      }
      if (!imported.path.startsWith("node:")) {
        const pkg = imported.path.startsWith("@") ? imported.path.split("/").slice(0, 2).join("/") : imported.path.split("/")[0];
        dependencies.set(pkg, JSON.parse(readFileSync(join(web, "node_modules", pkg, "package.json"), "utf8")).version);
      }
    }
    const path = resolve(sourceWeb, name);
    if (!path.startsWith(`${directory}/`) || !path.endsWith(".mjs")) throw new Error("invalid_job_output");
    return { path: relative(directory, path), sha256: digest(readFileSync(path)) };
  });
  const manifest = { version: 1, revision, sourceTree, builtAt: new Date().toISOString(), esbuild: esbuild.version,
    lockfileSha256: digest(lockfile), inputs, outputs,
    externalDependencies: Object.fromEntries([...dependencies].sort()) };
  rmSync(source, { recursive: true });
  writeFileSync(join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [revision, output, extra] = process.argv.slice(2);
  if (!revision || !output || extra) throw new Error("usage: exact-commit artifact-directory");
  const manifest = await buildNativeJobs(revision, output);
  process.stdout.write(`${JSON.stringify({ revision: manifest.revision, inputs: manifest.inputs.length,
    outputs: manifest.outputs.map((item) => item.path), artifact: resolve(output) })}\n`);
}
