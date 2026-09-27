import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { root, trackedFiles } from "./inventory.mjs";

export function physicalLines(text) {
  return text ? text.split("\n").length - (text.endsWith("\n") ? 1 : 0) : 0;
}
export function prohibited(path) {
  return /(^|\/)(\.DS_Store|\.agents|AGENTS\.md|node_modules|\.next|coverage|\.env(?!\.example$)[^/]*)(\/|$)/.test(path)
    || /\.(pem|key|p12|tsbuildinfo)$/.test(path);
}
export function checkSource(files = trackedFiles()) {
  const problems = [];
  const sizes = [];
  for (const path of files) {
    if (!existsSync(resolve(root, path))) problems.push(`Missing tracked file: ${path}`);
    if (prohibited(path)) problems.push(`Prohibited tracked file: ${path}`);
    if (!/\.(mjs|ts|tsx|go|css|sh|py)$/.test(path) || !existsSync(resolve(root, path))) continue;
    const lines = physicalLines(readFileSync(resolve(root, path), "utf8"));
    sizes.push({ path, lines });
    if (lines > 500) problems.push(`Over 500 lines: ${path} (${lines})`);
    else if (lines > 300) problems.push(`Responsibility review required: ${path} (${lines}); document an exact-path decision before proceeding`);
  }
  return { problems, sizes: sizes.sort((a, b) => b.lines - a.lines).slice(0, 5) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkSource();
  console.log("Largest handwritten files:", result.sizes);
  result.problems.forEach((p) => console.error(p));
  if (result.problems.length) process.exitCode = 1;
}
