import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, renameSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

export const nativeUnits = ["tinywarden.service", ...["history", "notifications", "retention"]
  .flatMap((name) => [`tinywarden-${name}.service`, `tinywarden-${name}.timer`])];

export function quoteUnitValue(value) {
  if (!value || [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new Error("invalid_unit_path");
  }
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "%%")}"`;
}

export function renderNativeUnits(root) {
  if (!isAbsolute(root)) throw new Error("absolute_checkout_required");
  const checkout = resolve(root);
  quoteUnitValue(checkout); // Reject control characters before rendering any unit.
  if (checkout.trim() !== checkout || checkout.endsWith("\\")) throw new Error("invalid_unit_path");
  return nativeUnits.map((name) => {
    const template = readFileSync(join(checkout, "deploy/systemd", name), "utf8");
    const content = template.replace(/^(WorkingDirectory|EnvironmentFile)=%h\/tinywarden([^\r\n]*)$/gm,
      (_, key, suffix) => `${key}=${(checkout + suffix).replaceAll("%", "%%")}`);
    if (content.includes("%h/tinywarden")) throw new Error("unrendered_unit_path");
    return { name, content };
  });
}

// Install private copies: moving or editing repository templates cannot change a
// loaded service behind the operator's back. Enabling/starting stays explicit.
export function installNativeUnits(root, backup, directory = join(homedir(), ".config/systemd/user")) {
  const units = renderNativeUnits(root);
  const previous = join(backup, "units-before");
  mkdirSync(previous, { mode: 0o700 });
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (const { name, content } of units) {
    const file = join(directory, name), temporary = `${file}.prepared`;
    if (existsSync(file)) copyFileSync(file, join(previous, name));
    writeFileSync(temporary, content, { mode: 0o600, flag: "wx" });
    renameSync(temporary, file);
  }
  return units.map(({ name }) => name);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [flag, backup, extra] = process.argv.slice(2);
  const root = fileURLToPath(new URL("../", import.meta.url));
  if (flag !== "--backup" || !backup || extra || !isAbsolute(backup) ||
      resolve(backup) === resolve(root) || resolve(backup).startsWith(`${resolve(root)}/`)) {
    throw new Error("usage: --backup absolute-new-directory-outside-checkout");
  }
  mkdirSync(backup, { mode: 0o700 });
  console.log(JSON.stringify({ installed: installNativeUnits(root, backup) }));
}
