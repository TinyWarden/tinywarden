import { locale, messages } from "@/i18n/messages";
import type { BaselineHistory } from "@/server/skills/results/baseline-health";
import type { Condition } from "@/server/skills/legacy/shared/types";
import { baselineValuesLabel } from "../../../../components/skills/baseline-editor-model";

const t = messages.baseline, v = t.view, d = messages.disk;
const dates = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
export const baselineDate = (value: string) => `${dates.format(new Date(value))} ${messages.fleet.utc}`;
export const baselineReason = (reason: string) => ({ ...t.reasons, ...t.currentReasons } as Record<string, string>)[reason] ?? t.reasons.unsupported_observation;
const epoch = (value: number | null) => value === null ? v.unverified : baselineDate(new Date(value * 1000).toISOString());
const condition = (c: Condition) => `${c.passed === null ? v.unverified : c.passed ? v.passed : v.skipped}${d.itemSeparator}${epoch(c.checked_at)}`;
const systemd = (code: string) => (v.systemdStates as Record<string, string>)[code] ?? v.unverified;
export function BaselineObservation({ run }: { run: BaselineHistory }) {
  const o = run.observation;
  return <div className="flex min-w-0 flex-col gap-4 text-sm">
    <p>{baselineReason(run.assessment.reason)}{run.assessment.incomplete && <span>{d.itemSeparator}{run.assessment.informational ? v.limitedAssurance : v.incomplete}</span>}</p>
    <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
      <div><dt className="text-muted-foreground">{d.finished}</dt><dd>{baselineDate(run.finished_at)}</dd></div>
      <div><dt className="text-muted-foreground">{d.source}</dt><dd>{run.mode === "inherit" ? d.inherit : d.override}{d.itemSeparator}{d.definitionRevision} {run.definition_revision}{d.itemSeparator}{d.policyVersion} {run.policy_version}</dd></div>
      <div><dt className="text-muted-foreground">{v.normalizer}</dt><dd className="break-all">{run.normalizer}</dd></div>
      <div><dt className="text-muted-foreground">{v.evaluator}</dt><dd className="break-all">{run.evaluator}</dd></div>
      <div><dt className="text-muted-foreground">{v.assessmentVersion}</dt><dd>{run.assessment_version}</dd></div>
      <div><dt className="text-muted-foreground">{v.recipe}</dt><dd>{baselineValuesLabel(run.values)}</dd></div>
      <div><dt className="text-muted-foreground">{d.dropped}</dt><dd>{run.dropped_runs}</dd></div>
    </dl>
    {o?.packages && <dl className="grid gap-3 sm:grid-cols-2">
      {([[v.upgraded, o.packages.upgraded], [v.installed, o.packages.installed], [v.removed, o.packages.removed], [v.heldBack, o.packages.held_back]] as const)
        .map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd>{value}</dd></div>)}
    </dl>}
    {o?.reboot && <p>{v.marker}{d.fieldSeparator}{o.reboot.marker_observed ? v.observed : v.notObserved}</p>}
    {run.assessment_version === 3 && run.fstrim_context ? <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
      <div><dt className="text-muted-foreground">{v.lastObservedResult}</dt><dd>{run.fstrim_context.last_execution ?
        v.recordedResults[run.fstrim_context.last_execution.outcome] : v.awaitingRecordedRun}</dd></div>
      <div><dt className="text-muted-foreground">{v.lastObservedExecution}</dt><dd>{epoch(run.fstrim_context.last_execution?.finished_at ?? run.fstrim_context.last_execution?.observed_at ?? null)}</dd></div>
      <div><dt className="text-muted-foreground">{v.expectedRun}</dt><dd>{epoch(run.fstrim_context.expected_at)}</dd></div>
      <p className="sm:col-span-2">{v.trimAssurance}</p>
    </dl> : null}
    {o?.fstrim && <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
      {([[v.timer, `${systemd(o.fstrim.timer.load_state)}${d.itemSeparator}${systemd(o.fstrim.timer.active_state)}${d.itemSeparator}${systemd(o.fstrim.timer.unit_file_state)}`],
        [v.service, `${systemd(o.fstrim.service.load_state)}${d.itemSeparator}${systemd(o.fstrim.service.active_state)}${d.itemSeparator}${run.assessment_version === 3 && o.fstrim.service.started_at === null && o.fstrim.service.finished_at === null && o.fstrim.service.active_state !== "failed" ? v.noCurrentBootResult : systemd(o.fstrim.service.result)}`],
        [v.lastTrigger, epoch(o.fstrim.timer.last_trigger)], [v.nextTrigger, epoch(o.fstrim.timer.next_elapse)],
        [v.serviceStarted, epoch(o.fstrim.service.started_at)], [v.serviceFinished, epoch(o.fstrim.service.finished_at)],
        [v.exit, `${o.fstrim.service.exit_kind}${d.pairSeparator}${o.fstrim.service.exit_status}`],
        [v.timer + d.itemSeparator + v.condition, condition(o.fstrim.timer.condition)],
        [v.service + d.itemSeparator + v.condition, condition(o.fstrim.service.condition)]] as const)
        .map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="break-words">{value}</dd></div>)}
    </dl>}
  </div>;
}
