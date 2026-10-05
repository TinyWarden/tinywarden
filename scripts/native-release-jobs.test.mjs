import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { digest } from "./native-release-source.mjs";
import { verifyJobArtifact, pinJobArtifact } from "./native-release-jobs.mjs";
test("fixed maintenance artifacts match the accepted tree and preserve previous overrides", () => {
  const root = mkdtempSync(join(tmpdir(), "tinywarden-job-proof-"));
  try {
    const web = resolve(root), artifact = join(web, "dist/native-jobs/u1"), tree = "1".repeat(40);
    mkdirSync(artifact, { recursive: true }); writeFileSync(join(web, "package-lock.json"), "{}\n");
    const input = { path: "scripts/history.ts", sha256: "2".repeat(64) };
    const outputs = ["notifications.mjs", "retention.mjs", "history.mjs"].map((path) => {
      writeFileSync(join(artifact, path), "export {};\n"); return { path, sha256: digest("export {};\n") };
    });
    const manifest = { version: 1, sourceTree: tree, inputs: [input], outputs, externalDependencies: {}, lockfileSha256: digest("{}\n") };
    writeFileSync(join(artifact, "manifest.json"), JSON.stringify(manifest));
    const release = { sourceTree: tree, files: [input] };
    assert.equal(verifyJobArtifact(root, release, artifact), artifact);
    assert.throws(() => verifyJobArtifact(root, { ...release, sourceTree: "3".repeat(40) }, artifact), /source_mismatch/);
    const config = join(root, "config"), backup = join(root, "backup"); mkdirSync(backup);
    mkdirSync(join(config, "tinywarden-retention.service.d"), { recursive: true });
    writeFileSync(join(config, "tinywarden-retention.service.d/20-u1-fixed-source.conf"), "previous\n");
    pinJobArtifact(artifact, backup, config);
    assert.equal(readFileSync(join(backup, "job-overrides-before/retention.conf"), "utf8"), "previous\n");
    assert.match(readFileSync(join(config, "tinywarden-retention.service.d/20-u1-fixed-source.conf"), "utf8"), /retention\.mjs" --expected-database \$\{TW_MAINTENANCE_DATABASE\} --apply\n$/);
    assert.match(readFileSync(join(config, "tinywarden-history.service.d/20-u1-fixed-source.conf"), "utf8"), /history\.mjs.*run --expected-database \$\{TW_MAINTENANCE_DATABASE\}/);
    writeFileSync(join(artifact, "history.mjs"), "changed\n");
    assert.throws(() => verifyJobArtifact(root, release, artifact), /output_changed/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
