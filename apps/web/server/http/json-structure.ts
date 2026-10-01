import { fail } from "../errors";

// Run only after JSON syntax validation. Detect duplicate decoded field names
// that JSON.parse would otherwise silently overwrite, including escaped names.
export function validateJsonStructure(text: string): void {
  let i = 0, nodes = 0;
  function space() { while (/\s/.test(text[i] ?? "") && i < text.length) i++; }
  function string(): string {
    const start = i++;
    while (i < text.length) {
      const c = text[i++];
      if (c === "\\") i++;
      else if (c === '"') return JSON.parse(text.slice(start, i)) as string;
    }
    fail("invalid_request", 400);
  }
  function value(depth: number): void {
    if (++nodes > 8192 || depth > 16) fail("invalid_request", 400);
    space();
    if (text[i] === '"') { string(); return; }
    if (text[i] === "{" || text[i] === "[") {
      const object = text[i++] === "{", end = object ? "}" : "]", keys = new Set<string>();
      space();
      while (text[i] !== end) {
        if (object) {
          const key = string();
          if (keys.has(key)) fail("invalid_request", 400);
          keys.add(key); space(); i++;
        }
        value(depth + 1); space();
        if (text[i] !== ",") break;
        i++; space();
      }
      i++; return;
    }
    while (i < text.length && !/[\s,}\]]/.test(text[i]!)) i++;
  }
  value(0); space();
  if (i !== text.length) fail("invalid_request", 400);
}
