import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { digest } from "./native-release-source.mjs";
import { quoteUnitValue } from "./install-native-services.mjs";
export function verifyJobArtifact(root, release, directory) {
  const artifact = resolve(directory), web = resolve(root);
  if (!artifact.startsWith(join(web, "dist/native-jobs/"))) throw new Error("job_artifact_location");
  const manifest = JSON.parse(readFileSync(join(artifact, "manifest.json"), "utf8"));
  const files = new Map(release.files.map((file) => [file.path, file.sha256]));
  if (manifest.version !== 1 || manifest.sourceTree !== release.sourceTree ||
    manifest.lockfileSha256 !== digest(readFileSync(join(web, "package-lock.json"))) ||
    !Array.isArray(manifest.inputs) || !manifest.inputs.length || !Array.isArray(manifest.outputs) ||
    manifest.inputs.some((input) => files.get(input.path) !== input.sha256)) throw new Error("job_source_mismatch");
  const names = manifest.outputs.map((item) => item.path).sort();
  if (JSON.stringify(names) !== JSON.stringify(["history.mjs", "notifications.mjs", "retention.mjs"])) throw new Error("job_output_inventory");
  for (const output of manifest.outputs) if (digest(readFileSync(join(artifact, output.path))) !== output.sha256) throw new Error("job_output_changed");
  for(const input of manifest.inputs.filter((i)=>i.path.startsWith("runtime/")))
    if(digest(readFileSync(join(artifact,input.path)))!==input.sha256)throw new Error("job_runtime_changed");
  for (const [pkg, version] of Object.entries(manifest.externalDependencies ?? {})) {
    if (!/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/.test(pkg) ||
      JSON.parse(readFileSync(join(web, "node_modules", pkg, "package.json"))).version !== version) throw new Error("job_dependency_mismatch");
  }
  return artifact;
}
export function pinJobArtifact(artifact, backup, configuration = join(homedir(), ".config/systemd/user")) {
  if (/[\r\n]/.test(artifact)) throw new Error("job_artifact_location");
  const names = { retention: "--expected-database ${TW_MAINTENANCE_DATABASE} --apply",
    notifications: "run --expected-database ${TW_MAINTENANCE_DATABASE}", history: "run --expected-database ${TW_MAINTENANCE_DATABASE}" };
  mkdirSync(join(backup, "job-overrides-before"), { mode: 0o700 });
  for (const [name, args] of Object.entries(names)) {
    const directory = join(configuration, `tinywarden-${name}.service.d`);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = join(directory, "20-u1-fixed-source.conf"), temporary = `${file}.prepared`;
    if (existsSync(file)) copyFileSync(file, join(backup, "job-overrides-before", `${name}.conf`));
    const runtime=existsSync(join(artifact,"runtime/skills/artifact.json"))?`Environment=TW_SKILL_RUNTIME_ASSETS=${quoteUnitValue(join(artifact,"runtime/skills"))}\n`:"";
    writeFileSync(temporary, `[Service]\nExecStart=\nExecStart=/usr/bin/env node ${quoteUnitValue(join(artifact, `${name}.mjs`))} ${args}\n${runtime}`, { mode: 0o600, flag: "wx" });
    renameSync(temporary, file);
  }
}
