import { recordAgentContact } from "../../fleet/contact-evidence";
import { duplicateRun } from "./receipts";
import type { Kysely } from "kysely";
import type { Database } from "../../db/types";
import { fail } from "../../errors";
import { authorizeAgent } from "../../fleet/agent-authority";
import { exactObject, fingerprint, uuid } from "../../validation";
import { lockedDefinition } from "../settings/disk";
import { latchDiskRecovery } from "../assignments/recovery";

const runReasons = new Set(["none", "inventory_unavailable", "inventory_malformed",
  "inventory_overflow", "records_overflow", "topology_changed", "mount_disappeared",
  "mount_inaccessible", "mount_unverifiable", "unsupported_type", "collector_timeout",
  "collector_failed", "output_overflow", "queue_overflow"]);
const mountReasons = new Set(["none", "unsupported_type", "mount_disappeared",
  "mount_inaccessible", "mount_unverifiable"]);
const uint64max = 18446744073709551615n;
const timePattern = /^\d{4}-(0[1-9]|1[0-2])-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export interface RunMount {
  mount_id: number; mount_path: string; mount_root: string; filesystem_type: string;
  kind: "local" | "unsupported"; writable: boolean; shared_capacity: boolean;
  reason: string; total_bytes: string | null; free_bytes: string | null;
  available_bytes: string | null;
}
export interface DiskRunInput {
  run_id: string; run_sequence: number; assignment_id: string;
  started_at: string; finished_at: string; coverage: "complete" | "incomplete";
  reason: string; excluded_kernel: number; excluded_remote: number;
  dropped_runs: number; mounts: RunMount[];
}

function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    fail("invalid_request", 400);
  }
  return value;
}
function instant(value: unknown): string {
  if (typeof value !== "string" || !timePattern.test(value)) fail("invalid_request", 400);
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) fail("invalid_request", 400);
  return value;
}
function path(value: unknown): string {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") < 1 ||
      Buffer.byteLength(value, "utf8") > 1024 || Buffer.from(value).toString("utf8") !== value ||
      [...value].some((char) => char.codePointAt(0)! < 32 || char.codePointAt(0) === 127)) {
    fail("invalid_request", 400);
  }
  return value;
}
function bytes(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,19})$/.test(value) ||
      BigInt(value) > uint64max) fail("invalid_request", 400);
  return value;
}
function mount(value: unknown): RunMount {
  const raw = exactObject(value, ["mount_id", "mount_path", "mount_root", "filesystem_type",
    "kind", "writable", "shared_capacity", "reason", "total_bytes", "free_bytes",
    "available_bytes"]);
  const kind = raw.kind;
  if (kind !== "local" && kind !== "unsupported") fail("invalid_request", 400);
  const reason = raw.reason;
  if (typeof reason !== "string" || !mountReasons.has(reason) ||
      (kind === "unsupported") !== (reason === "unsupported_type") ||
      typeof raw.writable !== "boolean" || typeof raw.shared_capacity !== "boolean" ||
      typeof raw.filesystem_type !== "string" ||
      !/^[a-zA-Z0-9._+-]{1,64}$/.test(raw.filesystem_type)) fail("invalid_request", 400);
  const total = bytes(raw.total_bytes), free = bytes(raw.free_bytes), available = bytes(raw.available_bytes);
  if ((reason === "none") !== (total !== null && free !== null && available !== null)) {
    fail("invalid_request", 400);
  }
  if (total !== null && free !== null && available !== null &&
      (BigInt(free) > BigInt(total) || BigInt(available) > BigInt(free) ||
        BigInt(total) - BigInt(free) + BigInt(available) === 0n)) fail("invalid_request", 400);
  return { mount_id: integer(raw.mount_id, 1, 2147483647), mount_path: path(raw.mount_path),
    mount_root: path(raw.mount_root), filesystem_type: raw.filesystem_type,
    kind, writable: raw.writable, shared_capacity: raw.shared_capacity, reason,
    total_bytes: total, free_bytes: free, available_bytes: available };
}

export function diskRunInput(raw: Record<string, unknown>): DiskRunInput {
  const coverage = raw.coverage;
  const reason = raw.reason;
  if ((coverage !== "complete" && coverage !== "incomplete") ||
      typeof reason !== "string" || !runReasons.has(reason) ||
      (coverage === "complete") !== (reason === "none") ||
      !Array.isArray(raw.mounts) || raw.mounts.length > 128) fail("invalid_request", 400);
  const mounts = raw.mounts.map(mount);
  if (mounts.some((item, i) => i > 0 && item.mount_id <= mounts[i - 1]!.mount_id) ||
      (coverage === "complete" && mounts.some((item) => item.reason !== "none"))) {
    fail("invalid_request", 400);
  }
  const started = instant(raw.started_at), finished = instant(raw.finished_at);
  if (started > finished) fail("invalid_request", 400);
  return { run_id: uuid(raw.run_id), run_sequence: integer(raw.run_sequence, 1, Number.MAX_SAFE_INTEGER),
    assignment_id: uuid(raw.assignment_id), started_at: started, finished_at: finished,
    coverage, reason, excluded_kernel: integer(raw.excluded_kernel, 0, 4096),
    excluded_remote: integer(raw.excluded_remote, 0, 4096),
    dropped_runs: integer(raw.dropped_runs, 0, Number.MAX_SAFE_INTEGER), mounts };
}

export function diskRunDigest(run: DiskRunInput): Buffer {
  return fingerprint([1, run.run_id, run.run_sequence, run.assignment_id, run.started_at,
    run.finished_at, run.coverage, run.reason, run.excluded_kernel, run.excluded_remote,
    run.dropped_runs, run.mounts.map((m) => [m.mount_id, m.mount_path, m.mount_root,
      m.filesystem_type, m.kind, m.writable, m.shared_capacity, m.reason,
      m.total_bytes, m.free_bytes, m.available_bytes])]);
}

export function classifyMount(mount: RunMount, warning: number, critical: number):
  "healthy" | "warning" | "critical" | "informational" | "unknown" {
  if (mount.reason !== "none" || mount.total_bytes === null ||
      mount.free_bytes === null || mount.available_bytes === null) return "unknown";
  if (!mount.writable) return "informational";
  const used = BigInt(mount.total_bytes) - BigInt(mount.free_bytes);
  const denominator = used + BigInt(mount.available_bytes);
  if (denominator === 0n) return "unknown";
  return 100n * used >= BigInt(critical) * denominator ? "critical"
    : 100n * used >= BigInt(warning) * denominator ? "warning" : "healthy";
}

export async function acceptDiskRun(db: Kysely<Database>, credential: string,
  input: DiskRunInput, clock: () => Date) {
  const digest = diskRunDigest(input);
  const result = await db.transaction().execute(async (trx) => {
    await lockedDefinition(trx);
    const authority = await authorizeAgent(trx, credential, clock);
    const { host, agent, now } = authority;
    const snapshot = await trx.selectFrom("check_assignment_snapshots").selectAll()
      .where("id", "=", input.assignment_id).executeTakeFirst();
    if (!snapshot) {
      await latchDiskRecovery(trx, host.id, agent.id, agent.current_generation,
        "assignment_snapshot_missing", now);
      return { rejection: "assignment_unknown" as const };
    }
    if (snapshot.host_id !== host.id || snapshot.agent_id !== agent.id ||
        snapshot.generation !== agent.current_generation || snapshot.applicability !== "ready" ||
        now < snapshot.created_at) fail("assignment_unknown", 409);
    const duplicate = await duplicateRun(trx, "disk", { hostId: host.id,
      agentId: agent.id, generation: agent.current_generation }, input, digest);
    if (duplicate) { await recordAgentContact(trx, authority); return duplicate; }
    const classified = input.mounts.map((mount) => ({ ...mount,
      classification: classifyMount(mount, snapshot.warning_percent, snapshot.critical_percent) }));
    const worst = classified.some((mount) => mount.classification === "critical") ? "critical"
      : classified.some((mount) => mount.classification === "warning") ? "warning"
        : classified.some((mount) => mount.classification === "healthy") ? "healthy" : "unknown";
    await trx.insertInto("disk_runs").values({ id: input.run_id, host_id: host.id,
      agent_id: agent.id, generation: agent.current_generation,
      run_sequence: input.run_sequence, assignment_id: input.assignment_id,
      started_at: input.started_at, finished_at: input.finished_at, received_at: now,
      coverage: input.coverage, reason: input.reason,
      excluded_kernel: input.excluded_kernel, excluded_remote: input.excluded_remote,
      dropped_runs: input.dropped_runs, worst_classification: worst,
      request_digest: digest }).execute();
    if (input.mounts.length) await trx.insertInto("disk_run_mounts").values(classified.map((mount) => ({
      run_id: input.run_id, ...mount }))).execute();
    await recordAgentContact(trx, authority);
    return { run_id: input.run_id, run_sequence: input.run_sequence,
      received_at: now.toISOString(), duplicate: false };
  });
  if ("rejection" in result) fail(result.rejection, 409);
  return result;
}
