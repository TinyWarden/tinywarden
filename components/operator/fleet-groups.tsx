"use client";
import {MaintenanceBadge} from "./agent-maintenance";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {columnKey,type DashboardColumn} from "@/lib/skills/dashboard-types";
import {DashboardCell} from "./dashboard-cell";
import { PlaybookButton } from "@/components/playbook/controls";
import { messages } from "@/i18n/messages";
import type { FleetGroup } from "@/server/fleet/dashboard-model";
import { m, reason, text, time, type FleetHost, type FleetView } from "./format";
function State({ state }: { state: string }) {
  return <span className={`tw-pill tw-pill--${state === "offline" ? "critical" : state === "disabled" ? "off" : state}`}><span aria-hidden="true">{m.symbols[state as keyof typeof m.symbols] ?? m.symbols.unknown}</span>{m.states[state as keyof typeof m.states] ?? m.unknown}</span>;
}
function HostCard({ host,columns,outdated,asOf }: { host: FleetHost;columns:DashboardColumn[];outdated:boolean;asOf:string }) {
  const partial = host.checks[0]?.facts.disk?.coverage === "incomplete";
  const measured = host.primary_key === "contact" ? host.last_contact_at : host.checks.find((c) => c.key === host.primary_key)?.facts.measured_at;
  return <Link className={`tw-host-card tw-tone-${host.primary_state}`} href={"/fleet/" + host.host_id} aria-label={m.details + messages.disk.fieldSeparator + host.label}>
    {host.group === "attention" ? <span className="tw-host-stripe" aria-hidden="true" /> : null}
    <div className="tw-host-body"><div className="tw-host-heading"><span className="tw-host-name">{host.label}</span><MaintenanceBadge value={host.maintenance}/>
      <span className="tw-tag tw-tag--caveat">{m.connection}{m.separator}{(m.connectionStates as Record<string, string>)[host.contact_state] ?? m.connectionStates.unknown}</span>
      <State state={host.primary_state} /><span className="tw-meta tw-since">{host.since || measured ? text(host.since ? m.firstObserved : m.sampled, { time: time(host.since ?? measured ?? null) }) : m.noSample}</span></div>
      <p>{reason(host)}{partial ? <span className="tw-coverage">{m.separator}{m.partial}</span> : null}</p>
      {host.contact_state === "stale" ? <p>{text(m.lastContact, { time: time(host.last_contact_at, true) })}{m.separator}{host.heartbeat_interval_seconds === null ? m.cadenceUnavailable : text(m.cadence, { seconds: host.heartbeat_interval_seconds })}</p> : null}
      <dl className="tw-dashboard-card-values">{columns.map(column=><div key={columnKey(column.ref)}><dt className="tw-meta">{column.label}</dt><dd><DashboardCell column={column} cell={host.dashboard_values[columnKey(column.ref)]} outdated={outdated} asOf={asOf}/></dd></div>)}</dl></div>
  </Link>;
}
function Healthy({hosts,columns,outdated,asOf}:{hosts:FleetHost[];columns:DashboardColumn[];outdated:boolean;asOf:string}) {
  const router=useRouter();
  return <div className="tw-data-scroll"><table className="tw-table tw-table--comfortable tw-table--stack tw-table--sticky tw-table--edge-align tw-table--wrap-headings tw-dashboard-table" aria-label={m.healthyTitle}>
    <thead><tr><th scope="col">{m.server}</th>{columns.map(column=><th scope="col" key={columnKey(column.ref)} title={column.skill_name??undefined}>{column.label}</th>)}</tr></thead>
    <tbody>{hosts.map(host=>{
      const href="/fleet/"+host.host_id;
      return <tr key={host.host_id} title={text(m.lastContact,{time:time(host.last_contact_at,true)})} onClick={event=>{
        if((event.target as Element).closest("a,button,input")||window.getSelection()?.toString())return;
        if(event.ctrlKey||event.metaKey||event.shiftKey)window.open(href,"_blank","noopener");else router.push(href);
      }}>
        <td><div className="tw-host-heading"><Link href={href} className="tw-link tw-cell-entity" aria-label={m.details+messages.disk.fieldSeparator+host.label}>{host.label}</Link><MaintenanceBadge value={host.maintenance}/></div><span className="tw-meta tw-connection">{host.checks.every(c=>c.state==="disabled")?messages.skills.allOff:m.online}</span></td>
        {columns.map(column=><td key={columnKey(column.ref)} className="tw-cell-machine" data-label={column.label}><DashboardCell column={column} cell={host.dashboard_values[columnKey(column.ref)]} outdated={outdated} asOf={asOf}/></td>)}
      </tr>;
    })}</tbody>
  </table></div>;
}
export function FleetGroups({ view, busy, outdated, pages, next, previous }: { view: FleetView; busy: boolean; outdated: boolean;
  pages: Record<FleetGroup, (string | null)[]>; next: (group: FleetGroup) => void; previous: (group: FleetGroup) => void }) {
  return <div className={`tw-ui tw-groups${outdated ? " tw-outdated" : ""}`}>
    {(["attention", "unknown", "healthy"] as const).map((key) => {
      const group = view.groups[key], count = view.counts[key];
      if (count === 0) return null;
      return <section key={key} className={`tw-fleet-group tw-group-${key}`} aria-labelledby={`${key}-heading`}>
        <div className={`tw-gutter tw-fleet-gutter${key === "unknown" ? " tw-gutter--2" : key === "healthy" ? " tw-gutter--3" : ""}`}><strong className="tw-gutter__n">{String(count).padStart(2, "0")}</strong><span className="tw-gutter__label">{m.gutters[key].map((part) => <span key={part}>{part}</span>)}</span></div>
        <div className="tw-group-panel"><header className="tw-group-heading"><div><h2 id={`${key}-heading`}>{m[`${key}Title`]}</h2><p>{m[`${key}Help`]}</p></div>
          {key === "attention" ? <div className="tw-group-badges">{view.counts.critical > 0 ? <span className="tw-pill tw-pill--critical">{view.counts.critical}{m.separator}{m.critical}</span> : null}
            {view.counts.warning > 0 ? <span className="tw-pill tw-pill--warning">{view.counts.warning}{m.separator}{m.warning}</span> : null}</div>
            : key === "healthy" ? <span className="tw-pill tw-pill--healthy">{m.symbols.healthy}{m.separator}{count}{m.separator}{m.healthy}</span> : null}</header>
          {!group.hosts.length ? <p className="tw-group-empty">{m.groupEmpty}</p> : key === "healthy" ? <Healthy hosts={group.hosts} columns={view.columns} outdated={outdated} asOf={view.as_of} /> : group.hosts.map((host) => <HostCard host={host} columns={view.columns} outdated={outdated} asOf={view.as_of} key={host.host_id} />)}
          {pages[key].length || group.next_cursor ? <div className="tw-pagination"><PlaybookButton variant="secondary" className="tw-btn--xs" type="button" disabled={!pages[key].length || busy} onClick={() => previous(key)}>{messages.fleet.previous}</PlaybookButton>
            <PlaybookButton variant="secondary" className="tw-btn--xs" type="button" disabled={!group.next_cursor || busy} onClick={() => next(key)}>{messages.fleet.next}</PlaybookButton></div> : null}
        </div>
      </section>;
    })}
  </div>;
}
