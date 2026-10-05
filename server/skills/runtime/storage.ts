import path from "node:path";
import { runtimeRequest, SkillRuntimeError } from "./client";
import type { PackageMetadata } from "../../../lib/skills/package-types";
export const packageStore = path.resolve(process.env.TW_SKILL_PACKAGE_STORE ?? path.join(process.cwd(), "var/skills"));
export function packageDirectory(digest: string, store = packageStore): string {
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new SkillRuntimeError("package_digest");
  return path.join(store, digest);
}
export function publishPackage(directory: string, official = false, store = packageStore): Promise<PackageMetadata> {
  return runtimeRequest({ action: "publish", package: directory, store, official });
}
