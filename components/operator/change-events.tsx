import Link from "next/link";
import { m, text, time, percentLabel, skillName, type EventView } from "./format";
import type { HistoryFacts } from "@/server/history/types";
function facts(value: HistoryFacts | null) {
  if (!value) return m.unknownFact;
  if (value.package) return value.package.reason;
  if (value.disk) return text(m.factDisk, { path: value.disk.path, percent: percentLabel(value.disk) });
  if (value.packages) return text(m.factPackages, value.packages);
  if (value.marker_observed !== undefined) return value.marker_observed ? m.requested : m.noMarker;
  if (value.trim) {
    const t = value.trim;
    if (t.last_observed_result !== undefined) return text(m.factTrimObserved, {
      result: t.last_observed_result ? m.trimResults[t.last_observed_result] : m.trimPending,
      expected: t.expected_at ? time(new Date(t.expected_at * 1000).toISOString(), true) : m.unknownFact });
    return text(m.factTrim, { timer: t.timer_state, service: t.service_state, result: t.result });
  }
  if (value.contact_at) return text(m.contactFact, { time: time(value.contact_at, true) });
  return m.unknownFact;
}
function title(event: EventView) {
  const check = skillName(event.subject_key, event.after_facts?.package?.name ?? event.before_facts?.package?.name);
  return text(event.kind === "gap" ? m.eventGap : event.kind === "context" ? m.eventContext : m.eventState,
    { check, before: event.from_state ? m.states[event.from_state] : m.noPrevious, after: m.states[event.to_state] });
}
export function ChangeEvents({ events, expanded = false }: { events: EventView[]; expanded?: boolean }) {
  return <ol className={`tw-events${expanded ? " tw-events-full" : ""}`}>{events.map((event) => <li key={event.id}>
    <time className="tw-mono" dateTime={event.observed_at}>{time(event.observed_at, expanded)}</time>
    <div><div className="tw-event-title"><Link className="tw-host-name" href={"/fleet/" + event.host_id}>{event.host_label}</Link>
      <span className={`tw-event-state tw-tone-${event.to_state}`}>{title(event)}</span></div>
      <p>{facts(event.after_facts)}</p>
      {event.after_gap || event.kind === "gap" ? <p className="tw-event-note">{m.gapNote}</p> : null}
      {event.kind === "context" ? <p className="tw-event-note">{m.contextNote}</p> : null}
      {expanded ? <details className="tw-event-evidence"><summary>{text(m.observedAt, { time: time(event.observed_at, true) })}</summary>
        <dl><dt>{m.before}</dt><dd>{facts(event.before_facts)}</dd><dt>{m.after}</dt><dd>{facts(event.after_facts)}</dd></dl>
        <p>{text(m.source, { source: event.source_revision, policy: event.policy_version, assessment: event.assessment_version ?? m.noAssessment })}</p>
        <Link href={"/history?host=" + event.host_id}>{m.hostHistory}</Link></details> : null}
    </div>
  </li>)}</ol>;
}
