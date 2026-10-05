import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, statSync, lstatSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { nativeUnits, quoteUnitValue, renderNativeUnits, installNativeUnits } from "./install-native-services.mjs";

test("native units support a custom checkout and replace repository links with independent copies", () => {
  const base = mkdtempSync(join(tmpdir(), "tinywarden-units-"));
  try {
    const root = join(base, 'custom checkout%"'), config = join(base, "config"), backup = join(base, "backup");
    mkdirSync(join(root, "deploy/systemd"), { recursive: true }); mkdirSync(config); mkdirSync(backup);
    for (const name of nativeUnits) writeFileSync(join(root, "deploy/systemd", name),
      readFileSync(new URL(`../deploy/systemd/${name}`, import.meta.url)));
    const previous = join(base, "old.service"); writeFileSync(previous, "old installed unit\n");
    symlinkSync(previous, join(config, "tinywarden.service"));
    const rendered = renderNativeUnits(root);
    assert.equal(rendered.length, 7);
    assert.ok(rendered.filter(({ name }) => name.endsWith(".service"))
      .every(({ content }) => content.includes(`WorkingDirectory=${root.replaceAll("%", "%%")}\n`)));
    assert.ok(rendered.every(({ content }) => !content.includes("%h/tinywarden")));
    installNativeUnits(root, backup, config);
    assert.equal(lstatSync(join(config, "tinywarden.service")).isSymbolicLink(), false);
    assert.equal(statSync(join(config, "tinywarden.service")).mode & 0o777, 0o600);
    assert.equal(readFileSync(join(backup, "units-before/tinywarden.service"), "utf8"), "old installed unit\n");
    assert.equal(readFileSync(previous, "utf8"), "old installed unit\n");
    const checked = spawnSync("systemd-analyze", ["verify", ...nativeUnits.map((name) => join(config, name))], { encoding: "utf8" });
    assert.equal(checked.status, 0, checked.stderr);
    assert.equal(checked.stderr, "");
    writeFileSync(join(root, "deploy/systemd/tinywarden.service"), "template changed\n");
    assert.equal(readFileSync(join(config, "tinywarden.service"), "utf8"), rendered[0].content);
    assert.throws(() => quoteUnitValue("path\nExecStart=unexpected"), /invalid_unit_path/);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
