import { spawn } from "node:child_process";
import path from "node:path";
import type { PackageMetadata } from "../../../lib/skills/package-types";
import { verifiedAssets } from "./assets";

export class SkillRuntimeError extends Error {
  constructor(readonly code: string) { super(code); }
}
export const runtimeAssets = path.resolve(process.env.TW_SKILL_RUNTIME_ASSETS ?? path.join(process.cwd(), "runtime/skills"));
interface Request {
  action: "inspect" | "publish" | "publish_archive" | "run"; package?: string; content_sha256?: string; official?: boolean; store?: string;
  archive?: string; archive_sha256?: string;
  function?: "validate_settings" | "reduce" | "evaluate"; arguments?: unknown;
}
interface Pending { start: () => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
let active = 0, paused = false;
const queue: Pending[] = [];

function slot<T>(action: () => Promise<T>): Promise<T> {
  if (paused) return Promise.reject(new SkillRuntimeError("cleanup_failed"));
  if (active >= 2 && queue.length >= 32) return Promise.reject(new SkillRuntimeError("runtime_busy"));
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      if (paused) { reject(new SkillRuntimeError("cleanup_failed")); return; }
      active++;
      void action().then(resolve, reject).finally(() => {
        active--;
        const next = queue.shift();
        if (next) { clearTimeout(next.timer); next.start(); }
      });
    };
    if (active < 2) start();
    else {
      const pending: Pending = { start, reject, timer: setTimeout(() => {
        const index = queue.indexOf(pending); if (index >= 0) queue.splice(index, 1);
        reject(new SkillRuntimeError("runtime_busy"));
      }, 5000) };
      queue.push(pending);
    }
  });
}

export async function runtimeRequest<T>(request: Request): Promise<T> {
  if (!await verifiedAssets(runtimeAssets)) throw new SkillRuntimeError("runtime_unavailable");
  const input = JSON.stringify(request);
  if (Buffer.byteLength(input) > 1024 * 1024) throw new SkillRuntimeError("input_exceeded");
  return slot(() => new Promise<T>((resolve, reject) => {
    const process = spawn("/usr/bin/python3.13", ["-I", "-S", "-B", `${runtimeAssets}/supervisor.py`],
      { cwd: "/", env: { NODE_ENV: "production" }, stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let size = 0, diagnostics = 0, exceeded = false, finished = false, started = false;
    process.on("spawn", () => { started = true; });
    const terminate = () => { process.kill("SIGTERM"); };
    const deadline = setTimeout(terminate, 7000);
    const hardDeadline = setTimeout(() => { paused = true; process.kill("SIGKILL"); }, 10000);
    process.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= 1024 * 1024) chunks.push(chunk);
      else { exceeded = true; terminate(); }
    });
    process.stderr.on("data", (chunk: Buffer) => {
      diagnostics += chunk.length;
      if (diagnostics > 16384) { exceeded = true; terminate(); }
    });
    const settle = (error?: Error, value?: T) => {
      if (finished) return;
      finished = true; clearTimeout(deadline); clearTimeout(hardDeadline);
      if (error) reject(error); else resolve(value!);
    };
    process.on("error", () => settle(new SkillRuntimeError("runtime_unavailable")));
    process.stdin.on("error", () => undefined);
    process.on("close", (code) => {
      if (code !== 0) { paused ||= started; settle(new SkillRuntimeError(started ? "cleanup_failed" : "runtime_unavailable")); return; }
      if (exceeded) { settle(new SkillRuntimeError("output_exceeded")); return; }
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as T & { error?: string };
        if (value.error) {
          if (value.error === "cleanup_failed") paused = true;
          settle(new SkillRuntimeError(value.error));
        } else settle(undefined, value);
      } catch { paused = true; settle(new SkillRuntimeError("output_invalid")); }
    });
    process.stdin.end(input);
  }));
}

export function inspectPackage(directory: string, official = false): Promise<PackageMetadata> {
  return runtimeRequest({ action: "inspect", package: directory, official });
}
export async function invokePackage<T>(directory: string, digest: string, official: boolean,
  fn: NonNullable<Request["function"]>, args: unknown): Promise<T> {
  const value = await runtimeRequest<{ result: T; content_sha256: string }>({ action: "run", package: directory,
    content_sha256: digest, official, function: fn, arguments: args });
  if (value.content_sha256 !== digest) throw new SkillRuntimeError("package_digest");
  return value.result;
}
