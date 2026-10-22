import { globSync as scanDirectories, isDynamicPattern } from "tinyglobby";
import { parse, isAbsolute } from "node:path";
import { statSync } from "node:fs";

// Only the pinned Next ESLint root-directory lookup uses this adapter.
export function globSync(pattern, options) {
  if (typeof pattern !== "string" || !pattern || !options || options.onlyDirectories !== true || Object.keys(options).some((key) => key !== "onlyDirectories")) {
    throw new TypeError("unsupported_next_eslint_glob_options");
  }
  // Literal roots include directory symlinks, without scanning their descendants.
  if (!isDynamicPattern(pattern)) {
    try { return statSync(pattern).isDirectory() ? [pattern] : []; }
    catch (error) { if (["ENOENT", "ENOTDIR"].includes(error.code)) return []; throw error; }
  }
  // tinyglobby expands literal directories by default; fast-glob does not.
  // A terminal globstar must select descendants, not its own base directory.
  const descendants = pattern.replace(/(^|\/)\*\*\/?$/, "$1**/*");
  return scanDirectories(descendants, { onlyDirectories: true, expandDirectories: false, absolute: isAbsolute(pattern) }).map((directory) => {
    const value = !pattern.endsWith("/") && directory.endsWith("/") && directory.length > parse(directory).root.length ? directory.slice(0, -1) : directory;
    return pattern.startsWith("./") && !value.startsWith("./") ? `./${value}` : value;
  });
}
