"use client";
import {AgentSettingsButton} from "@/components/operator/agent-maintenance";
import {useOperatorSession} from "@/components/operator/session-provider";
import {RowStatus} from "@/components/playbook/controls";
import {FactGrid} from "@/components/playbook/data";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {compareSkillNames} from "@/lib/skills/dashboard-types";
import { messages } from "@/i18n/messages";
import { OperatorShell, ReadNotice } from "@/components/operator/shell";
import { text, time } from "@/components/operator/format";
import { useOperatorRead } from "@/components/operator/use-operator-read";
import { instant } from "@/components/operator/read-validation";
import type { HostProjection } from "@/server/fleet/inventory";
import { JumpToSkill } from "./jump-to-skill";
import { cadence } from "../../../skills/_components/skill-model";
import type {PackageResults} from "@/components/skills/package-model";
import { validPackageResults } from "@/components/skills/package-model";
import { PackageCard } from "./package-card";
const t = messages.server;
type Inventory = { schema_version: 1; as_of: string; host: HostProjection };
function validInventory(v: unknown): v is Inventory {
  const r = v as Inventory; return !!v && typeof v === "object" && instant(r.as_of) && r.schema_version === 1 && !!r.host && typeof r.host.label === "string" && typeof r.host.host_id === "string" && ["current","stale","unknown","revoked"].includes(r.host.contact_state) && (r.host.last_contact_at === null || instant(r.host.last_contact_at));
}
const attention = (state: string) => ["critical", "warning", "unknown", "stale"].includes(state);
export function ServerClient({ initial }: { initial: Inventory }) {
  const id = initial.host.host_id;
  const validateInventory = useCallback((v: unknown): v is Inventory => validInventory(v) && v.host.host_id === id, [id]);
  const inventory = useOperatorRead(`/api/v1/operator/hosts/${id}`,validateInventory,60000);
  const packages = useOperatorRead(`/api/v2/operator/hosts/${id}/skills?include_readings=false`,validPackageResults,manualPoll);
  const [clock, setClock] = useState(() => 0);
  useEffect(() => { const tick = window.setInterval(() => setClock(performance.now()),1000); return () => window.clearInterval(tick); }, []);
  const reloadPackages = packages.reload;
  const expired = inventory.expired || packages.expired;
  const host = inventory.value?.host ?? initial.host, asOf = inventory.value?.as_of ?? initial.as_of;
  const contactDeadline = host.stale_at ? inventory.receivedAt + Date.parse(host.stale_at) - Date.parse(asOf) - inventory.requestDuration : Infinity;
  const contact = host.contact_state === "current" && inventory.value && clock >= contactDeadline ? "stale" : host.contact_state;
  const packageSkills = packages.value?.skills ?? [];
  const packageExpired = (until: string | null) => packages.failed || !!until && !!packages.value && clock >= packages.receivedAt + Date.parse(until) - Date.parse(packages.value.as_of) - packages.requestDuration;
  const states = Object.fromEntries(packageSkills.map(skill => [skill.key, packageExpired(skill.valid_until) && skill.state !== "disabled" ? "unknown" : skill.state]));
  const names = Object.fromEntries(packageSkills.map(skill => [skill.key, skill.name]));
  const ordered = [...packageSkills].sort((a,b) => compareSkillNames(a.name,b.name) || a.key.localeCompare(b.key));
  const admin=useOperatorSession()?.role==="admin";
  return <OperatorShell active="fleet" asOf={asOf}><main id="main" tabIndex={-1} className="tw-main tw-server">
    <ReadNotice expired={expired} failed={inventory.failed || packages.failed} loaded={!!inventory.value} />
    {!expired && inventory.value ? <><nav className="tw-server-breadcrumb" aria-label={t.breadcrumb}><Link href="/fleet">{messages.fleetManagement.title}</Link><span>{t.slash}</span><span className="tw-mono">{host.label}</span></nav>
      <section className="tw-server-header">{host.lifecycle!=="active"?<div className="tw-ui tw-card__body"><RowStatus status="off" value={messages.fleetManagement[host.lifecycle]}/><p>{host.lifecycle==="paused"?messages.fleetManagement.pauseHelp:messages.fleetManagement.archiveHelp}</p></div>:null}<header><div className="tw-server-copy"><span className="tw-meta">{text(t.headingMeta,{time:time(host.last_contact_at,true)})}</span><h1>{host.label}</h1><div className="tw-server-contact"><span className={`tw-server-contact-badge tw-contact-${contact}`}>{messages.dashboard.connectionStates[contact]}</span><p>{t.contactHelp}</p></div></div><div className="tw-ui"><div className="tw-btns">{admin?<Link className="tw-btn tw-btn--secondary" href={`/fleet?lifecycle=${host.lifecycle}&q=${encodeURIComponent(host.label)}`}>{messages.fleetManagement.manageFleet}</Link>:null}<AgentSettingsButton hostId={id} hostName={host.label}/><Link className="tw-btn tw-btn--secondary" href={`/history?host=${id}`}>{t.history}</Link></div></div></header>
        <div className="tw-ui"><FactGrid className="tw-server-facts tw-facts--edge-align" facts={([[messages.fleet.operatingSystem,`${host.os_id} ${host.os_version}`],[messages.fleet.architecture,host.architecture],[messages.fleet.reportedHostname,host.reported_hostname],[messages.fleet.agentVersion,host.agent_version],[messages.fleet.cadence,cadence(host.heartbeat_interval_seconds)],[messages.fleet.lastContact,time(host.last_contact_at,true)]] as const).map(([label,value])=>({key:label,label,value,mono:true}))}/></div>
      </section><div className="tw-server-tools"><span className="tw-meta">{text(t.skillsMeta,{count:packageSkills.length,healthy:Object.values(states).filter((s) => s === "healthy").length,attention:Object.values(states).filter(attention).length,disabled:Object.values(states).filter((s) => s === "disabled").length})}</span>
        {ordered.filter(skill => attention(states[skill.key] ?? "unknown")).map(skill => <a key={skill.key} href={`#${skill.key}`} className={`tw-server-button tw-flag-${states[skill.key]}`}>{skill.name}</a>)}<JumpToSkill states={states} names={names} /></div>
      {!packages.value ? <p role={packages.failed?"alert":"status"}>{packages.failed?t.loadFailed:t.loadingSkills}{packages.failed?<button type="button" className="tw-server-button" onClick={() => void reloadPackages()}>{messages.checks.retry}</button>:null}</p>:null}
      {packages.value ? ordered.length ? ordered.map(skill => <PackageCard key={skill.installation_id} skill={skill} view={packages.value!} hostLabel={host.label} outdated={packageExpired(skill.valid_until)} controlsOutdated={packages.failed} saved={reloadPackages}/>) : <p>{t.emptySkills}</p> : null}
    </> : null}</main></OperatorShell>;
}

function manualPoll(value:PackageResults|null){return value?.skills.some(s=>s.manual_run.latest?.phase==="queued"||s.manual_run.latest?.phase==="running")?2000:30000;}
