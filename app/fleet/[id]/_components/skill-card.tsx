"use client";
import { useCallback, useState } from "react";
import { messages } from "@/i18n/messages";
import { text, time } from "@/components/operator/format";
import { useOperatorRead } from "@/components/operator/use-operator-read";
import type { SkillKey } from "@/lib/skills/catalog";
import type { readBaselineHealth } from "@/server/skills/results/baseline-health";
import type { readDiskHealth } from "@/server/skills/results/disk-health";
import { BaselineObservation, baselineReason } from "./baseline-observation";
import { DiskRun } from "./disk-health";
import { cadence } from "../../../settings/_components/skill-model";
import { PolicyDialog } from "./policy-dialog";
import { DiskMounts, usedPercent, percentLabel } from "./mount-table";
import { validPolicy, policyPath, type Policy } from "./policy-model";
const t = messages.server, d = messages.disk, b = messages.baseline.view;
type BaselineCheck = Awaited<ReturnType<typeof readBaselineHealth>>["checks"][number];
export type DiskView = Awaited<ReturnType<typeof readDiskHealth>>;
export function stateName(state: string) { return (d as Record<string,unknown>)[state] as string ?? d.unknown; }
export const attention = (state: string) => ["critical", "warning", "unknown", "stale"].includes(state);
function diskSummary(health: DiskView) {
  if (health.reason !== "none") return (d.reason as Record<string,string>)[health.reason] ?? d.unknown;
  const mounts = health.latest?.mounts.filter((m) => m.writable && usedPercent(m) !== null) ?? [];
  mounts.sort((a,b) => usedPercent(b)! - usedPercent(a)!);
  const worst = mounts[0];
  return worst ? text(health.state === "healthy" ? t.diskHealthy : t.diskAttention,
    { count: mounts.length, path: worst.mount_path, percent: percentLabel(usedPercent(worst)!) }) : t.diskEmpty;
}
function CurrentFacts({ check }: { check: BaselineCheck }) {
  const run = check.latest, o = run?.observation;
  if (!run || !o) return null;
  const epoch = (v: number | null | undefined) => v == null ? b.unverified : time(new Date(v * 1000).toISOString(), true);
  const systemd = (v: string) => (b.systemdStates as Record<string,string>)[v] ?? b.unverified;
  const facts: [string,string | number][] = o.packages ? [[b.upgraded,o.packages.upgraded],[b.installed,o.packages.installed],[b.removed,o.packages.removed],[b.heldBack,o.packages.held_back]]
    : o.reboot ? [[b.marker,o.reboot.marker_observed ? b.observed : b.notObserved]]
      : o.fstrim ? [[b.timer,[systemd(o.fstrim.timer.load_state),systemd(o.fstrim.timer.active_state),systemd(o.fstrim.timer.unit_file_state)].join(t.separator)],
        [b.lastObservedResult,run.fstrim_context?.last_execution ? b.recordedResults[run.fstrim_context.last_execution.outcome] : b.awaitingRecordedRun],
        [b.lastObservedExecution,epoch(run.fstrim_context?.last_execution?.finished_at ?? run.fstrim_context?.last_execution?.observed_at)],
        [b.expectedRun,epoch(run.fstrim_context?.expected_at ?? o.fstrim.timer.next_elapse)]] : [];
  return facts.length ? <dl className="tw-server-facts">{facts.map(([label,value]) => <div key={label}><dt className="tw-meta">{label}</dt><dd>{value}</dd></div>)}</dl> : null;
}
export function SkillCard({ hostId, hostLabel, skill, disk, check, outdated, refresh }: {
  hostId: string; hostLabel: string; skill: SkillKey; disk?: DiskView | null | undefined; check?: BaselineCheck | undefined; outdated: boolean; refresh: () => void }) {
  const validate = useCallback((v: unknown): v is Policy => validPolicy(v) && v.host_id === hostId && v.definition_key === skill, [hostId,skill]);
  const read = useOperatorRead(policyPath(hostId,skill), validate, 60000), [modal, setModal] = useState(false);
  const rawState = skill === "disk-local" ? disk?.state : check?.state;
  const state = rawState === "disabled" ? "disabled" : outdated ? "unknown" : rawState ?? "unknown";
  const latest = disk?.latest ?? check?.latest, history = disk?.history ?? check?.history ?? [];
  const custom = read.value ? Object.keys(read.value.overrides).length : 0;
  const description = outdated ? messages.fleet.outdated : skill === "disk-local" ? disk ? diskSummary(disk) : t.diskEmpty : check ? baselineReason(check.reason) : messages.baseline.view.readFailure;
  const open = () => { if (read.value && !read.expired && !read.busy) setModal(true); else void read.reload(); };
  return <section id={skill} tabIndex={-1} className="tw-server-skill">
    <header><div><div className="tw-server-skill-title"><h2>{messages.skills.names[skill]}</h2><span className={`tw-pill tw-tone-${state}`}>{stateName(state)}</span></div>
      <p>{description}</p><span className="tw-meta">{text(t.runMeta, { time: latest ? time(latest.finished_at, true) : messages.fleet.never,
        cadence: read.value ? cadence(read.value.effective_values.interval_seconds) : t.unknownValue })}</span>
      {skill !== "disk-local" ? <p className="tw-server-scope">{messages.baseline.scope[skill]}</p> : null}
    </div><button type="button" className="tw-server-button" aria-haspopup="dialog" disabled={read.expired || read.busy} onClick={open}>
      {t.settings}{custom ? <span className="tw-custom-count">{custom}</span> : null}</button></header>
    {read.failed ? <p role="alert" className="tw-server-inline-notice">{t.loadFailed}<button type="button" onClick={() => void read.reload()}>{messages.checks.retry}</button></p> : null}
    {custom ? <div className="tw-server-custom"><span className="tw-meta">{t.customServer}</span><span>{text(t.customSummary,{count:custom})}</span><button type="button" onClick={open}>{t.review}</button></div> : null}
    {skill === "disk-local" && disk?.latest ? <DiskMounts run={disk.latest} /> : check ? <CurrentFacts check={check} /> : null}
    {state === "disabled" ? <p className="tw-server-inline-notice">{t.offScope}</p> : null}
    <details className="tw-server-runs"><summary><strong>{t.recent}</strong><span className="tw-meta">{text(t.recentMeta,{count:history.length,time:history[0] ? time(history[0].received_at,true) : messages.fleet.never})}</span></summary>
      <div>{disk ? disk.history.map((run) => <DiskRun key={run.run_id} run={run} open={false} />) : check?.history.map((run) => <details key={run.run_id} className="tw-server-run"><summary><span className="tw-mono">{time(run.received_at,true)}</span><span className="tw-mono">{text(t.runPrefix,{sequence:run.sequence})}</span><span>{stateName(run.assessment.state)}</span></summary><div><BaselineObservation run={run} /></div></details>)}
        {!history.length ? <p className="tw-server-inline-notice">{d.empty}</p> : null}</div>
    </details>
    {modal && read.value && !read.expired ? <PolicyDialog initial={read.value} hostLabel={hostLabel} close={() => setModal(false)} saved={() => { void read.reload(); refresh(); }} /> : null}
  </section>;
}
