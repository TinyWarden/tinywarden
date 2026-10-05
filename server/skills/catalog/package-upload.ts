import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, mkdtemp, open, rm } from "node:fs/promises";
import path from "node:path";
import { fail } from "../../errors";
import { packageStore } from "../runtime/storage";
import { SkillRuntimeError } from "../runtime/client";
import { importSkillArchive } from "./package-install";
import { operatorSnapshot, type PackageDb } from "./package-commands";
import { uuid } from "../../validation";

export const MAX_SKILL_ZIP = 10 * 1024 * 1024;
let uploads = 0;
export async function uploadSkill(db: PackageDb, cookie: string, request: Request, clock: () => Date, store = packageStore) {
  const id = uuid(request.headers.get("x-tinywarden-upload-id"));
  await operatorSnapshot(db, cookie, clock);
  if (request.headers.get("content-type") !== "application/zip" || request.headers.has("content-encoding")) fail("unsupported_media", 415);
  const length = request.headers.get("content-length");
  if (length !== null && (!/^[1-9][0-9]*$/.test(length) || Number(length) > MAX_SKILL_ZIP)) fail("request_too_large", 413);
  if (!request.body) fail("invalid_request", 400);
  if (uploads >= 2) fail("temporarily_unavailable", 503);
  uploads++;
  let staging: string | undefined;
  const reader = request.body.getReader();
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("upload_timeout")), 15000); });
  try {
    await mkdir(store, { recursive: true, mode: 0o700 });
    staging = await mkdtemp(path.join(store, ".upload-"));
    const archive = path.join(staging, "skill.zip");
    const file = await open(archive, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const hash = createHash("sha256");
    let size = 0;
    try {
      while (true) {
        const part = await Promise.race([reader.read(), deadline]);
        if (part.done) break;
        size += part.value.length;
        if (size > MAX_SKILL_ZIP) fail("request_too_large", 413);
        hash.update(part.value);
        await file.writeFile(part.value);
      }
      if (!size || length !== null && size !== Number(length)) fail("invalid_request", 400);
      await file.sync();
    } finally { await file.close(); }
    clearTimeout(timer);
    return await importSkillArchive(db, cookie, { request_id: id, archive, archive_sha256: hash.digest("hex") }, clock, store);
  } catch (error) {
    if (error instanceof SkillRuntimeError && error.code === "package_rejected") fail("package_rejected", 422);
    throw error;
  } finally {
    clearTimeout(timer); void reader.cancel().catch(() => undefined); reader.releaseLock();
    if (staging) await rm(staging, { recursive: true, force: true });
    uploads--;
  }
}
