import type { CSSProperties } from "react";
import { locale } from "@/i18n/messages";
import { m, text, time, type FleetView } from "./format";
import { Warden } from "../brand/warden";
import { fleetWardenState, visorColors } from "../brand/warden-state";
const plurals = new Intl.PluralRules(locale);
export function FleetHero({ view, outdated, busy, refresh }: { view: FleetView | null; outdated: boolean; busy: boolean; refresh: () => void }) {
  const c = view?.counts;
  const state = fleetWardenState(view, outdated);
  const headline = !c ? m.loadingTitle : c.total === 0 ? m.emptyTitle : c.attention > 0
    ? plurals.select(c.attention) === "one" ? m.needYouOne : m.needYou
    : c.unknown > 0 ? m.uncertainTitle : m.allClear;
  const bars = c ? [{ key: "critical", label: m.critical, n: c.critical }, { key: "warning", label: m.warning, n: c.warning },
    { key: "unknown", label: m.unknown, n: c.unknown }, { key: "healthy", label: m.healthy, n: c.healthy }] : [];
  return <section className={`tw-hero${outdated ? " tw-outdated" : ""}`} aria-labelledby="fleet-heading"
    style={{ "--fleet-severity": visorColors[state] } as CSSProperties}><div className="tw-hero-inner">
    <div className="tw-hero-top"><div className="tw-hero-copy">
      <div className="tw-hero-heading"><Warden key={state} state={state} /><div className="tw-hero-heading-copy">
      <div className="tw-hero-meta"><span className="tw-meta">{view ? text(plurals.select(c!.total) === "one" ? m.metaOne : m.meta,
        { count: c!.total, time: time(view.as_of) }) : m.title}</span>
        <span className="tw-refresh-group"><span className="tw-meta" aria-hidden="true">{m.separator}</span>
          <button type="button" className="tw-refresh" disabled={busy} onClick={refresh}>{busy ? m.refreshing : m.refresh}</button></span></div>
      <h1 id="fleet-heading">{c && c.attention > 0 ? <span>{c.attention}</span> : null}{headline}</h1>
      </div></div>
      <p>{!c ? m.loadingSummary : !c.total ? m.emptySummary : c.attention || c.unknown ? text(m.summary, c) : m.clearSummary}</p></div>
    {c && c.total > 0 ? <dl className="tw-hero-stats">{([[m.needLabel, c.attention], [m.cantSay, c.unknown], [m.healthyLabel, c.healthy]] as const).map(([label, count], i) =>
      <div key={label}><dt className="tw-meta">{label}</dt><dd className={i === 0 ? "tw-need-number" : undefined}>{count}</dd></div>)}</dl> : null}</div>
    {c && c.total > 0 ? <div className="tw-fleet-bar" aria-label={m.title}>{bars.filter((bar) => bar.n > 0).map((bar) =>
      <div key={bar.key} className={`tw-bar-group tw-tone-${bar.key}`} style={{ flexGrow: bar.n }}><span className="tw-bar-segment" />
        <span className="tw-meta"><i aria-hidden="true" />{bar.label}<strong>{bar.n}</strong></span></div>)}</div> : null}
  </div></section>;
}
