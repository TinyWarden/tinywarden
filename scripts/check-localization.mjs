import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import ts from "../apps/web/node_modules/typescript/lib/typescript.js";
import { root, trackedFiles } from "./inventory.mjs";

const copyAttributes = new Set(["title", "alt", "placeholder", "aria-label", "aria-description", "label"]);
export function literalCopy(source, filename = "view.tsx") {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings = [];
  function add(node) {
    findings.push(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1);
  }
  function walk(node) {
    if (ts.isJsxText(node) && node.text.trim()) add(node);
    if (ts.isJsxAttribute(node) && copyAttributes.has(node.name.getText(file)) && node.initializer) {
      const value = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (value && (ts.isStringLiteral(value) || ts.isTemplateExpression(value) || ts.isNoSubstitutionTemplateLiteral(value))) add(node);
    }
    if (ts.isJsxExpression(node) && !ts.isJsxAttribute(node.parent) && node.expression
        && (ts.isStringLiteral(node.expression) || ts.isTemplateExpression(node.expression)
          || ts.isNoSubstitutionTemplateLiteral(node.expression))) add(node);
    ts.forEachChild(node, walk);
  }
  walk(file);
  return [...new Set(findings)];
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const findings = trackedFiles().filter((p) => p.startsWith("apps/web/") && p.endsWith(".tsx"))
    .flatMap((p) => literalCopy(readFileSync(root + p, "utf8"), p).map((line) => `${p}:${line}: move display text to messages/en.json`));
  findings.forEach((p) => console.error(p));
  if (findings.length) process.exitCode = 1;
  else console.log("JSX literal-copy check passed (catalog review remains required)");
}
