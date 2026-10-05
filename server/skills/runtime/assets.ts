import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

export async function verifiedAssets(root: string): Promise<boolean> {
  try {
    const directory=await lstat(root),record=await lstat(path.join(root,"artifact.json"));
    if(!directory.isDirectory()||directory.isSymbolicLink()||!record.isFile()||record.isSymbolicLink()||record.size>65536)return false;
    const artifact = JSON.parse(await readFile(path.join(root, "artifact.json"), "utf8")) as {
      format: number; runtime: string; sdk: number; files: Record<string, string>;
    };
    if (artifact.format !== 1 || artifact.runtime !== "python-3.13-v1" || artifact.sdk !== 1 ||
      !artifact.files || Object.keys(artifact.files).length < 10 || Object.keys(artifact.files).length > 64 ||
      !Object.hasOwn(artifact.files, "supervisor.py") || !Object.hasOwn(artifact.files, "seccomp.py")) return false;
    for (const [name, hash] of Object.entries(artifact.files)) {
      if (!/^[a-zA-Z0-9_./-]+$/.test(name) || path.isAbsolute(name) || path.normalize(name) !== name ||
        name.startsWith("../") || !/^[0-9a-f]{64}$/.test(hash)) return false;
      const parts = name.split("/");
      for (let i = 1; i <= parts.length; i++) {
        const info = await lstat(path.join(root, ...parts.slice(0, i)));
        if (info.isSymbolicLink() || i < parts.length && !info.isDirectory() || i === parts.length && (!info.isFile() || info.size > 1048576)) return false;
      }
      if (createHash("sha256").update(await readFile(path.join(root, name))).digest("hex") !== hash) return false;
    }
    return true;
  } catch { return false; }
}
