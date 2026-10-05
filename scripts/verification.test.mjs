import { test } from "node:test";
import assert from "node:assert/strict";
import { physicalLines, prohibited } from "./check-source.mjs";
import { renderMap } from "./codebase-map.mjs";
import { literalCopy } from "./check-localization.mjs";

test("map refuses undocumented and stale file ownership", () => {
  assert.throws(() => renderMap(["src/domain.ts"], {}), /Missing roles/);
  assert.throws(() => renderMap([], { "deleted.ts": "Old role" }), /stale roles/);
  assert.match(renderMap(["package-lock.json"], {}), /dependency lockfile/);
});
test("source gate counts physical lines and rejects sensitive paths", () => {
  assert.equal(physicalLines("a\nb\n"), 2);
  assert.equal(physicalLines("a\nb"), 2);
  assert.equal(physicalLines(""), 0);
  for (const p of [".env", ".env.local", "x/.DS_Store", ".agents/context.md", "AGENTS.md"]) {
    assert.ok(prohibited(p), p);
  }
  assert.equal(prohibited(".env.example"), false);
});
test("localization gate catches text and accessible labels but permits catalog keys", () => {
  for (const source of ['<p>Hello</p>', '<input placeholder="Name"/>', '<p>{"Hello"}</p>', '<p>{`Hello ${name}`}</p>']) {
    assert.ok(literalCopy(source).length, source);
  }
  assert.deepEqual(literalCopy('<p className="flex">{messages.home.brand}</p>'), []);
});
