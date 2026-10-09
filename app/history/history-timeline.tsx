"use client";
import Link from "next/link";
import { useState } from "react";
import { m, text, time, type EventView } from "@/components/operator/format";
import { comparisons, dayKey, dayLabel, eventReason, observedAge, h } from "./history-format";
const tone = (state: EventView["to_state"] | null) => state === "offline" ? "critical" : state === "disabled" ? "off" : state ?? "unknown";
function State({ state }: { state: EventView["to_state"] | null }) {
  return state ? <span className={`tw-pill tw-pill--${tone(state)}`}><span aria-hidden="true">{m.symbols[state]}</span>{m.states[state]}</span> : <span className="tw-meta">{m.noPrevious}</span>;
}
function Event({ event, asOf, initiallyOpen }: { event: EventView; asOf: string; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return <li className={`tw-event${event.kind === "context" ? " tw-event--baseline" : event.kind === "gap" ? " tw-event--gap" : ""}`}>
    <time className="tw-event__when" dateTime={event.observed_at} title={time(event.observed_at, true)}><span className="tw-event__time">{time(event.observed_at)}</span><span className="tw-meta">{observedAge(event.observed_at, asOf)}</span></time>
    {event.kind !== "context" ? <span aria-hidden="true" className={`tw-edge tw-edge--${event.kind === "gap" ? "gap" : tone(event.to_state)}`} /> : null}
    <div className="tw-event__main">
      <div className="tw-event__head">
        {event.kind !== "state" ? <span className={event.kind === "gap" ? "tw-pill tw-pill--gap" : "tw-meta tw-history-contextlabel"}>{event.kind === "gap" ? h.gap : h.baseline}</span> : null}
        <Link className="tw-link tw-host-name" href={"/fleet/" + event.host_id}>{event.host_label}</Link><strong className="tw-event__skill">{event.after_facts?.package?.name ?? event.before_facts?.package?.name ?? (h.skillNames as Record<string,string>)[event.subject_key] ?? event.subject_key}</strong>
        {event.kind === "state" ? <span className="tw-event__trans"><State state={event.from_state} /><span aria-hidden="true">{m.arrow}</span><State state={event.to_state} /></span> : null}
        <button className="tw-textbtn tw-event__end" type="button" aria-expanded={open} aria-controls={"event-" + event.id} onClick={() => setOpen(!open)}>{open ? h.hide : h.details}</button>
      </div>
      <p className="tw-event__text">{eventReason(event)}</p>
      {event.after_gap && event.kind !== "gap" ? <p className="tw-event__text">{m.gapNote}</p> : null}
      {event.kind === "gap" && event.previous_sample_at ? <p className="tw-meta">{text(h.gapWindow, { before: time(event.previous_sample_at, true), after: time(event.observed_at, true) })}</p> : null}
      {open ? <div id={"event-" + event.id} className="tw-history-evidence">
        <div className="tw-diff" role="table" aria-label={h.details}>
          <div role="rowgroup"><div className="tw-diff__row tw-diff__row--head" role="row"><span role="columnheader">{h.field}</span><span role="columnheader">{h.before}</span><span role="columnheader">{h.after}</span></div></div>
          <div role="rowgroup">{comparisons(event).map((row) => <div key={row.key} role="row" className={`tw-diff__row${row.changed ? " tw-diff__row--changed" : ""}`}>
            <span className="tw-diff__field" role="rowheader">{row.label}</span><span className="tw-diff__before" role="cell">{row.before}</span><span className="tw-diff__after" role="cell">{row.after}{row.changed ? <span className="tw-diff__delta">{h.changed}</span> : null}</span>
          </div>)}</div>
          <div className="tw-diff__foot tw-history-evidence-footer"><p className="tw-meta">{text(m.source, { source: event.source_revision, policy: event.policy_version, assessment: event.assessment_version ?? m.noAssessment })}</p>
            <Link className="tw-link" href={"/history?host=" + event.host_id}>{m.hostHistory}</Link></div>
        </div>
      </div> : null}
    </div>
  </li>;
}
export function HistoryTimeline({ events, asOf }: { events: EventView[]; asOf: string }) {
  const groups: { key: string; label: string; events: EventView[] }[] = [];
  for (const event of events) {
    const key = dayKey(event.observed_at), last = groups.at(-1);
    if (last?.key === key) last.events.push(event);
    else groups.push({ key, label: dayLabel(event.observed_at, asOf), events: [event] });
  }
  const firstState = events.find((event) => event.kind === "state")?.id;
  return groups.map((group) => <section key={group.key} aria-label={group.label}>
    <div className="tw-group"><strong className="tw-group__title">{group.label}</strong><span className="tw-group__count">{text(group.events.length === 1 ? h.eventOne : h.eventOther, { count: group.events.length })}</span></div>
    <ol>{group.events.map((event) => <Event key={event.id} event={event} asOf={asOf} initiallyOpen={event.id === firstState} />)}</ol>
  </section>);
}
