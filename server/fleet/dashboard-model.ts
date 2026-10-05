import { fail } from "../errors";
import { uuid } from "../validation";
import type { FleetEvidence } from "../skills/results/fleet-evidence";
import { packageDiskSummary } from "../skills/legacy/disk/package-summary";

export const fleetGroups = ["attention", "unknown", "healthy"] as const;
export type FleetGroup = typeof fleetGroups[number];
export type GroupCursor = { group: FleetGroup; priority: number; created_at: string; host_id: string };
export type DashboardCursors = Partial<Record<FleetGroup, GroupCursor>>;
export function dashboardOptions(search: string): DashboardCursors {
  const query = new URLSearchParams(search), output: DashboardCursors = {};
  const keys = [...query.keys()];
  if (keys.some((key) => !fleetGroups.includes(key as FleetGroup)) || new Set(keys).size !== keys.length) fail("invalid_request", 400);
  for (const group of fleetGroups) {
    const raw = query.get(group);
    if (raw === null) continue;
    if (raw.length > 256 || !/^[A-Za-z0-9_-]+$/.test(raw)) fail("invalid_request", 400);
    let values: unknown;
    try {
      const bytes = Buffer.from(raw, "base64url");
      if (bytes.toString("base64url") !== raw) fail("invalid_request", 400);
      values = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch { fail("invalid_request", 400); }
    if (!Array.isArray(values) || values.length !== 4 || values[0] !== group ||
      !Number.isInteger(values[1]) || values[1] < 0 || values[1] > 3 || (group === "attention" ? values[1] > 1 : values[1] !== (group === "unknown" ? 2 : 3)) || typeof values[2] !== "string" ||
      !Number.isFinite(new Date(values[2]).getTime()) || new Date(values[2]).toISOString() !== values[2]) fail("invalid_request", 400);
    output[group] = { group, priority: values[1], created_at: values[2], host_id: uuid(values[3]) };
  }
  return output;
}
export function projectFleetHost(evidence: FleetEvidence) {
  const disk = evidence.disk;
  const packages = (evidence.packages ?? []).filter((p) => p.package_lane || p.key.includes("/"));
  const owned = new Set(packages.map((p) => p.key));
  const packageDisk = packages.find((p)=>p.key==="disk-local"&&p.official);
  const diskSummary = packageDisk ? packageDiskSummary(packageDisk.assessment) : null;
  const checks = [...[disk, ...evidence.baselines].filter((c) => !owned.has(c.key)), ...packages.map(({ metadata, assessment, defaults, overrides, ...summary }) => {
    // These large/private configuration objects belong to the skill detail API.
    void metadata; void assessment; void defaults; void overrides; return summary;
  })];
  const activeChecks = checks.filter((check) => check.state !== "disabled");
  const critical = (!owned.has("disk-local") && disk.attention === "critical") || checks.some((check) => check.state === "critical");
  const warning = !critical && ((!owned.has("disk-local") && disk.attention === "warning") || checks.some((check) => check.state === "warning"));
  const uncertainty = evidence.contact !== "current" || !!diskSummary?.incomplete || activeChecks.some((check) => !["healthy", "warning", "critical"].includes(check.state));
  const group: FleetGroup = critical || warning ? "attention" : uncertainty ? "unknown" : "healthy";
  const primary = critical || warning ? checks.find((check) =>
    check.state === (critical ? "critical" : "warning") || check.key === "disk-local" && !owned.has("disk-local") && disk.attention === (critical ? "critical" : "warning"))!
    : evidence.contact !== "current" ? evidence.contact_check : activeChecks.find((check) => check.state !== "healthy") ?? null;
  return { host_id: evidence.host.id, agent_id: evidence.agent?.id ?? null,
    generation: evidence.agent?.current_generation ?? null, label: evidence.host.label,
    reported_hostname: evidence.host.reported_hostname, os_id: evidence.host.os_id, os_version: evidence.host.os_version,
    architecture: evidence.host.architecture, agent_version: evidence.credential?.agent_version ?? evidence.host.enrolled_agent_version,
    created_at: evidence.host.created_at.toISOString(), contact_state: evidence.contact,
    last_contact_at: evidence.credential?.accepted_at?.toISOString() ?? null,
    heartbeat_interval_seconds: evidence.agent?.heartbeat_interval_seconds ?? null,
    group, priority: critical ? 0 : warning ? 1 : group === "unknown" ? 2 : 3, uncertainty,
    primary_key: primary?.key ?? null, primary_reason: primary?.reason ?? null,
    primary_state: critical ? "critical" : warning ? "warning" : primary?.state ?? "healthy",
    contact_check: evidence.contact_check, checks, worst_disk: owned.has("disk-local") ? diskSummary?.worst ?? null : disk.worst, since: null as string | null };
}
export type DashboardHost = ReturnType<typeof projectFleetHost>;
export function compareFleetRows(a: Pick<DashboardHost, "priority" | "created_at" | "host_id">, b: GroupCursor | DashboardHost) {
  return a.priority - b.priority || (a.created_at > b.created_at ? -1 : a.created_at < b.created_at ? 1
    : a.host_id > b.host_id ? -1 : a.host_id < b.host_id ? 1 : 0);
}
export function fleetCursor(host: DashboardHost) {
  return Buffer.from(JSON.stringify([host.group, host.priority, host.created_at, host.host_id])).toString("base64url");
}
