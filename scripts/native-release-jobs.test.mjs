import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { digest } from "./native-release-source.mjs";
import { verifyJobArtifact, pinJobArtifact, pinWebRuntimeArtifact } from "./native-release-jobs.mjs";
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
    mkdirSync(join(artifact,"runtime/skills"),{recursive:true});
    writeFileSync(join(artifact,"runtime/skills/artifact.json"),"{}\n");
    mkdirSync(join(config,"tinywarden.service.d"),{recursive:true});
    writeFileSync(join(config,"tinywarden.service.d/20-s2-runtime.conf"),"old-runtime\n");
    pinWebRuntimeArtifact(artifact,backup,config);
    assert.equal(readFileSync(join(backup,"web-runtime-before.conf"),"utf8"),"old-runtime\n");
    assert.match(readFileSync(join(config,"tinywarden.service.d/20-s2-runtime.conf"),"utf8"),/Environment=TW_SKILL_RUNTIME_ASSETS=.*runtime\/skills/);
    writeFileSync(join(artifact, "history.mjs"), "changed\n");
    assert.throws(() => verifyJobArtifact(root, release, artifact), /output_changed/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("account-mail worker pins an immutable entry without changing other job arguments",()=>{
 const root=mkdtempSync(join(tmpdir(),"tinywarden-account-mail-proof-"));
 try{
  const artifact=join(root,"artifact"),backup=join(root,"backup"),config=join(root,"units");mkdirSync(artifact);mkdirSync(backup);
  writeFileSync(join(artifact,"account-emails.mjs"),"export {};\n");pinJobArtifact(artifact,backup,config);
  assert.match(readFileSync(join(config,"tinywarden-account-emails.service.d/20-u1-fixed-source.conf"),"utf8"),/account-emails\.mjs" --expected-database \$\{TW_MAINTENANCE_DATABASE\}/);
  assert.match(readFileSync(join(config,"tinywarden-notifications.service.d/20-u1-fixed-source.conf"),"utf8"),/notifications\.mjs" run --expected-database/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test("maintenance reconciliation requires its pinned output and keeps legacy artifacts compatible",()=>{
 const root=mkdtempSync(join(tmpdir(),"tinywarden-maintenance-jobs-proof-"));
 try{
  const artifact=join(root,"dist/native-jobs/proof"),backup=join(root,"backup"),config=join(root,"units"),tree="1".repeat(40);
  mkdirSync(artifact,{recursive:true});mkdirSync(backup);mkdirSync(join(root,"scripts"));
  writeFileSync(join(root,"scripts/maintenance-jobs.ts"),"export {};\n");writeFileSync(join(root,"package-lock.json"),"{}\n");
  const input={path:"scripts/maintenance-jobs.ts",sha256:digest("export {};\n")};
  const outputs=["history.mjs","maintenance-jobs.mjs","notifications.mjs","retention.mjs"].map(path=>{
   writeFileSync(join(artifact,path),"export {};\n");return {path,sha256:digest("export {};\n")};
  });
  const manifest={version:1,sourceTree:tree,inputs:[input],outputs,externalDependencies:{},lockfileSha256:digest("{}\n")};
  writeFileSync(join(artifact,"manifest.json"),JSON.stringify(manifest));
  assert.equal(verifyJobArtifact(root,{sourceTree:tree,files:[input]},artifact),artifact);
  pinJobArtifact(artifact,backup,config);
  assert.match(readFileSync(join(config,"tinywarden-maintenance-jobs.service.d/20-u1-fixed-source.conf"),"utf8"),/maintenance-jobs\.mjs" --expected-database \$\{TW_MAINTENANCE_DATABASE\}/);
  manifest.outputs=outputs.filter(o=>o.path!=="maintenance-jobs.mjs");writeFileSync(join(artifact,"manifest.json"),JSON.stringify(manifest));
  assert.throws(()=>verifyJobArtifact(root,{sourceTree:tree,files:[input]},artifact),/job_output_inventory/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
