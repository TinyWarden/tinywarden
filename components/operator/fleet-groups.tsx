import Link from "next/link";
import { messages } from "@/i18n/messages";
import type { FleetGroup } from "@/server/fleet/dashboard-model";
import { m, reason, text, time, percent, percentLabel, skillName, type FleetHost, type FleetView } from "./format";
function State({ state }: { state: string }) {
  return <span className={`tw-pill tw-tone-${state}`}><span aria-hidden="true">{m.symbols[state as keyof typeof m.symbols] ?? m.symbols.unknown}</span>{m.states[state as keyof typeof m.states] ?? m.unknown}</span>;
}
function Chips({ host }: { host: FleetHost }) {
  return <div className="tw-chips">{[host.contact_check, ...host.checks].map((check) => {
    const disk = check.key === "disk-local" ? host.worst_disk : null;
    const state = disk && ["critical", "warning"].includes(disk.classification) ? disk.classification : check.state;
    const label = check.key === "contact" && state === "healthy" ? m.online : check.key === "reboot-required" && state === "healthy" ? m.noMarker :
      check.reason === "fstrim_scheduled" ? m.trimScheduled : check.reason === "fstrim_awaiting_result" ? m.trimPending :
      check.key === "reboot-required" && state === "warning" ? m.requested : m.states[state as keyof typeof m.states] ?? m.unknown;
    const full = disk ? percentLabel(disk) + m.separator + label : label;
    return <span key={check.key} className={`tw-chip tw-tone-${state}`} title={check.key === "contact" ? text(m.lastContact, { time: time(host.last_contact_at, true) }) : (messages.baseline.reasons as Record<string, string>)[check.reason] ?? label}>
      <span className="tw-meta">{skillName(check.key, "name" in check ? check.name : null)}</span><strong>{full}</strong></span>;
  })}</div>;
}
function HostCard({ host }: { host: FleetHost }) {
  const partial = host.checks[0]?.facts.disk?.coverage === "incomplete";
  const measured = host.primary_key === "contact" ? host.last_contact_at : host.checks.find((c) => c.key === host.primary_key)?.facts.measured_at;
  return <Link className={`tw-host-card tw-tone-${host.primary_state}`} href={"/fleet/" + host.host_id} aria-label={m.details + messages.disk.fieldSeparator + host.label}>
    {host.group === "attention" ? <span className="tw-host-stripe" aria-hidden="true" /> : null}
    <div className="tw-host-body"><div className="tw-host-heading"><span className="tw-host-name">{host.label}</span>
      <span className={`tw-pill tw-tone-${host.contact_state === "current" ? "healthy" : "unknown"}`}>{m.connection}{m.separator}{(m.connectionStates as Record<string, string>)[host.contact_state] ?? m.connectionStates.unknown}</span>
      <State state={host.primary_state} /><span className="tw-meta tw-since">{host.since || measured ? text(host.since ? m.firstObserved : m.sampled, { time: time(host.since ?? measured ?? null) }) : m.noSample}</span></div>
      <p>{reason(host)}{partial ? <span className="tw-coverage">{m.separator}{m.partial}</span> : null}</p>
      {host.contact_state === "stale" ? <p>{text(m.lastContact, { time: time(host.last_contact_at, true) })}{m.separator}{host.heartbeat_interval_seconds === null ? m.cadenceUnavailable : text(m.cadence, { seconds: host.heartbeat_interval_seconds })}</p> : null}
      <Chips host={host} /></div>
  </Link>;
}
function Healthy({ hosts }: { hosts: FleetHost[] }) {
  return <div className="tw-healthy-table" role="table" aria-label={m.healthyTitle}>
    <div className="tw-healthy-head tw-meta" role="row">{[m.server, m.os, m.agent, m.worstDisk, m.reboot].map((label) => <span role="columnheader" key={label}>{label}</span>)}</div>
    {hosts.map((host) => <Link role="row" className="tw-healthy-row" key={host.host_id} href={"/fleet/" + host.host_id} title={text(m.lastContact, { time: time(host.last_contact_at, true) })}>
      <span role="cell" className="tw-host-name">{host.label}<span className="tw-meta tw-connection">{host.checks.every((c) => c.state === "disabled") ? messages.skills.allOff : m.online}</span></span><span role="cell" className="tw-os">{host.os_id}{m.separator}{host.os_version}{m.separator}{host.architecture}</span>
      <span role="cell" className="tw-mono">{host.agent_version}</span>
      <span role="cell" className="tw-worst-disk" title={host.worst_disk?.path}>{host.worst_disk ? <><span className="tw-disk-track" aria-hidden="true"><i style={{ width: percent(host.worst_disk) + "%" }} /></span><span className="tw-mono">{percentLabel(host.worst_disk)}</span></> : m.noDisk}</span>
      <span role="cell" className="tw-reboot">{host.checks.find((c) => c.key === "reboot-required")?.state === "disabled" ? m.states.disabled : m.noMarker}</span>
    </Link>)}
  </div>;
}
export function FleetGroups({ view, busy, outdated, pages, next, previous }: { view: FleetView; busy: boolean; outdated: boolean;
  pages: Record<FleetGroup, (string | null)[]>; next: (group: FleetGroup) => void; previous: (group: FleetGroup) => void }) {
  return <div className={`tw-groups${outdated ? " tw-outdated" : ""}`}>
    {(["attention", "unknown", "healthy"] as const).map((key) => {
      const group = view.groups[key], count = view.counts[key];
      return <section key={key} className={`tw-group tw-group-${key}`} aria-labelledby={`${key}-heading`}>
        <div className="tw-gutter"><strong>{String(count).padStart(2, "0")}</strong><span className="tw-meta">{m.gutters[key].map((part) => <span key={part}>{part}</span>)}</span></div>
        <div className="tw-group-panel"><header className="tw-group-heading"><div><h2 id={`${key}-heading`}>{m[`${key}Title`]}</h2><p>{m[`${key}Help`]}</p></div>
          {key === "attention" ? <div className="tw-group-badges">{view.counts.critical > 0 ? <span className="tw-pill tw-tone-critical">{view.counts.critical}{m.separator}{m.critical}</span> : null}
            {view.counts.warning > 0 ? <span className="tw-pill tw-tone-warning">{view.counts.warning}{m.separator}{m.warning}</span> : null}</div>
            : key === "healthy" ? <span className="tw-pill tw-tone-healthy">{m.symbols.healthy}{m.separator}{count}{m.separator}{m.healthy}</span> : null}</header>
          {!group.hosts.length ? <p className="tw-group-empty">{m.groupEmpty}</p> : key === "healthy" ? <Healthy hosts={group.hosts} /> : group.hosts.map((host) => <HostCard host={host} key={host.host_id} />)}
          {pages[key].length || group.next_cursor ? <div className="tw-pagination"><button type="button" disabled={!pages[key].length || busy} onClick={() => previous(key)}>{messages.fleet.previous}</button>
            <button type="button" disabled={!group.next_cursor || busy} onClick={() => next(key)}>{messages.fleet.next}</button></div> : null}
        </div>
      </section>;
    })}
  </div>;
}
