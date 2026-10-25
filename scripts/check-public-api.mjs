import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { root } from "./inventory.mjs";

const api = JSON.parse(readFileSync(resolve(root, "docs/architecture/agent-public-api.json"), "utf8"));
const read = (name) => readFileSync(resolve(root, name), "utf8");
const normalize = (path) => path.replaceAll(/\{[^}]+\}/g, "{}");
const documented = [...read("docs/reference/agent-endpoints.md").matchAll(/`(?:GET|POST) (\/api\/[^`]+)`/g)].map((m) => normalize(m[1])).sort();
if (JSON.stringify(documented) !== JSON.stringify(api.agent_http_paths.map(normalize).sort())) throw new Error("Agent HTTP documentation differs from the pinned source inventory");
if (createHash("sha256").update(read("runtime/skills/artifact.json")).digest("hex") !== api.runtime_artifact_sha256) throw new Error("Agent API inventory and vendored runtime differ");
function routeExists(path) {
  let directories = [resolve(root, "app")];
  for (const segment of path.split("/").filter(Boolean)) {
    directories = directories.flatMap((directory) => {
      if (/^\{[^}]+\}$/.test(segment)) {
        return readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory() && /^\[[^\]]+\]$/.test(entry.name)).map((entry) => resolve(directory, entry.name));
      }
      const next = resolve(directory, segment);
      return existsSync(next) ? [next] : [];
    });
  }
  return directories.some((directory) => existsSync(resolve(directory, "route.ts")));
}
for (const path of api.agent_http_paths) {
  const route = path.includes("maintenance-recovery/") ? "/api/v1/maintenance-recovery/{mode}" : path;
  if (!routeExists(route)) throw new Error(`Documented route missing: ${path}`);
}
const sdk = read("docs/reference/skills/sdk.md"), host = read("docs/reference/skills/host-access.md"), actions = read("docs/reference/skills/actions.md");
function requireText(text, values, label) {
  for (const value of values) if (!text.includes(value)) throw new Error(`Undocumented ${label}: ${value}`);
}
requireText(host, api.host_operations.map((v) => `\`${v}\``), "host operation");
requireText(sdk, api.monitor_functions.map((v) => `\`${v}(`), "monitor function");
requireText(actions, api.action_functions.map((v) => `\`${v}(`), "action function");
requireText(actions, api.action_context_methods.map((v) => `context.${v}(`), "context method");
requireText(actions, [api.action_exception], "action exception");
requireText(sdk, api.author_commands.map((v) => `\`${v} `), "author command");
requireText(sdk, api.author_flags, "author option");
console.log(`Public API docs match source: ${api.agent_http_paths.length} HTTP calls, ${api.host_operations.length} broker operations and all SDK/author calls`);
