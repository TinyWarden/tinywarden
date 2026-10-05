"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { messages } from "@/i18n/messages";
import { OperatorShell, ReadNotice } from "@/components/operator/shell";
import { text, time } from "@/components/operator/format";
import { useOperatorRead } from "@/components/operator/use-operator-read";
import { instant } from "@/components/operator/read-validation";
import type { HostProjection } from "@/server/fleet/inventory";
import type { readBaselineHealth } from "@/server/skills/results/baseline-health";
import { SkillCard, attention, type DiskView } from "./skill-card";
import { JumpToSkill } from "./jump-to-skill";
import { skillOrder, validTiming } from "./policy-model";
import { cadence } from "../../../settings/_components/skill-model";
import { validPackageResults } from "@/components/skills/package-model";
import { PackageCard } from "./package-card";
const t = messages.server;
type Inventory = { schema_version: 1; as_of: string; host: HostProjection };
type Baselines = Awaited<ReturnType<typeof readBaselineHealth>> & { schema_version: 1 };
function validInventory(v: unknown): v is Inventory {
  const r = v as Inventory; return validTiming(v) && r.schema_version === 1 && !!r.host && typeof r.host.label === "string" && typeof r.host.host_id === "string" && ["current","stale","unknown","revoked"].includes(r.host.contact_state) && (r.host.last_contact_at === null || instant(r.host.last_contact_at));
}
function validDisk(v: unknown): v is DiskView {
  const r = v as DiskView; return validTiming(v) && ["critical","warning","healthy","unknown","stale","disabled"].includes(r.state) && typeof r.reason === "string" && Array.isArray(r.history) && r.history.length <= 5 && r.history.every((run) => Array.isArray(run.mounts) && instant(run.received_at));
}
function validBaselines(v: unknown): v is Baselines {
  const r = v as Baselines; return validTiming(v) && r.schema_version === 1 && Array.isArray(r.checks) && r.checks.length === 3 && new Set(r.checks.map((c) => c.definition_key)).size === 3 && r.checks.every((c) => skillOrder.slice(1).includes(c.definition_key) && ["warning","healthy","unknown","stale","disabled"].includes(c.state) && Array.isArray(c.history) && c.history.length <= 5 && (c.valid_until === null || instant(c.valid_until)));
}
export function ServerClient({ initial }: { initial: Inventory }) {
  const id = initial.host.host_id;
  const validateInventory = useCallback((v: unknown): v is Inventory => validInventory(v) && v.host.host_id === id, [id]);
  const validateBaseline = useCallback((v: unknown): v is Baselines => validBaselines(v) && v.host_id === id, [id]);
  const inventory = useOperatorRead(`/api/v1/operator/hosts/${id}`,validateInventory,60000);
  const disk = useOperatorRead(`/api/v1/operator/hosts/${id}/checks/disk-local/health`,validDisk,60000);
  const baselines = useOperatorRead(`/api/v1/operator/hosts/${id}/baselines`,validateBaseline,60000);
  const packages = useOperatorRead(`/api/v2/operator/hosts/${id}/skills`,validPackageResults,30000);
  const [clock, setClock] = useState(() => 0);
  useEffect(() => { const tick = window.setInterval(() => setClock(performance.now()),1000); return () => window.clearInterval(tick); }, []);
  const reloadInventory = inventory.reload, reloadDisk = disk.reload, reloadBaselines = baselines.reload, reloadPackages = packages.reload;
  const refresh = useCallback(() => { void reloadInventory(); void reloadDisk(); void reloadBaselines(); void reloadPackages(); },[reloadInventory,reloadDisk,reloadBaselines,reloadPackages]);
  const expired = inventory.expired || disk.expired || baselines.expired || packages.expired;
  const host = inventory.value?.host ?? initial.host, asOf = inventory.value?.as_of ?? initial.as_of;
  const contactDeadline = host.stale_at ? inventory.receivedAt + Date.parse(host.stale_at) - Date.parse(asOf) - inventory.requestDuration : Infinity;
  const contact = host.contact_state === "current" && inventory.value && clock >= contactDeadline ? "stale" : host.contact_state;
  const baselineExpired = (until: string | null | undefined) => !!until && !!baselines.value && clock >= baselines.receivedAt + Date.parse(until) - Date.parse(baselines.value.as_of) - baselines.requestDuration;
  const packageSkills = (packages.value?.skills ?? []).filter((s) => s.package_lane || s.key.includes("/"));
  const owned = new Set(packageSkills.map((s) => s.key));
  const packageExpired = (until: string | null) => packages.failed || !!until && !!packages.value && clock >= packages.receivedAt + Date.parse(until) - Date.parse(packages.value.as_of) - packages.requestDuration;
  const states = Object.fromEntries(skillOrder.filter((k) => !owned.has(k)).map((key) => {
    if (key === "disk-local") return [key, disk.outdated && disk.value?.state !== "disabled" ? "unknown" : disk.value?.state ?? "unknown"];
    const c = baselines.value?.checks.find((c) => c.definition_key === key);
    return [key,c?.state === "disabled" ? "disabled" : baselines.failed || baselineExpired(c?.valid_until) ? "unknown" : c?.state ?? "unknown"];
  }));
  for (const skill of packageSkills) states[skill.key] = packageExpired(skill.valid_until) && skill.state !== "disabled" ? "unknown" : skill.state;
  const names = Object.fromEntries([...skillOrder.map((k) => [k,messages.skills.names[k]]),...packageSkills.map((s) => [s.key,s.name])]);
  return <OperatorShell active="servers" asOf={asOf}><main id="main" tabIndex={-1} className="tw-main tw-server">
    <ReadNotice expired={expired} failed={inventory.failed || disk.failed || baselines.failed || packages.failed} loaded={!!inventory.value} />
    {!expired ? <><nav className="tw-server-breadcrumb" aria-label={t.breadcrumb}><Link href="/fleet">{messages.dashboard.navServers}</Link><span>{t.slash}</span><span className="tw-mono">{host.label}</span></nav>
      <section className="tw-server-header"><header><div><span className="tw-meta">{text(t.headingMeta,{time:time(host.last_contact_at,true)})}</span><h1>{host.label}</h1><div className="tw-server-contact"><span className={`tw-server-contact-badge tw-contact-${contact}`}>{messages.dashboard.connectionStates[contact]}</span><p>{t.contactHelp}</p></div></div><Link className="tw-server-button" href={`/history?host=${id}`}>{t.history}</Link></header>
        <dl className="tw-server-facts">{[[messages.fleet.operatingSystem,`${host.os_id} ${host.os_version}`],[messages.fleet.architecture,host.architecture],[messages.fleet.reportedHostname,host.reported_hostname],[messages.fleet.agentVersion,host.agent_version],[messages.fleet.cadence,cadence(host.heartbeat_interval_seconds)],[messages.fleet.lastContact,time(host.last_contact_at,true)]].map(([label,value]) => <div key={label}><dt className="tw-meta">{label}</dt><dd className="tw-mono">{value}</dd></div>)}</dl>
      </section><div className="tw-server-tools"><span className="tw-meta">{text(t.skillsMeta,{healthy:Object.values(states).filter((s) => s === "healthy").length,attention:Object.values(states).filter(attention).length,disabled:Object.values(states).filter((s) => s === "disabled").length})}</span>
        {Object.keys(states).filter((k) => attention(states[k] ?? "unknown")).map((k) => <a key={k} href={`#${k}`} className={`tw-server-button tw-flag-${states[k]}`}>{names[k]}</a>)}<JumpToSkill states={states} names={names} /></div>
      {skillOrder.filter((skill) => !owned.has(skill)).map((skill) => <SkillCard key={skill} hostId={id} hostLabel={host.label} skill={skill}
        disk={skill === "disk-local" ? disk.value : undefined} check={baselines.value?.checks.find((c) => c.definition_key === skill)}
        outdated={skill === "disk-local" ? disk.outdated : baselines.failed || baselineExpired(baselines.value?.checks.find((c) => c.definition_key === skill)?.valid_until)} refresh={refresh} />)}
      {packages.value ? packageSkills.map((skill) => <PackageCard key={skill.installation_id} skill={skill} view={packages.value!} outdated={packageExpired(skill.valid_until)} saved={reloadPackages} />) : null}
      <footer className="tw-server-footer"><span className="tw-meta">{text(t.dataMeta,{time:time(asOf,true)})}</span><button type="button" disabled={inventory.busy || disk.busy || baselines.busy} onClick={refresh}>{messages.dashboard.refresh}</button><p>{t.readingScope}</p></footer>
    </> : null}</main></OperatorShell>;
}
