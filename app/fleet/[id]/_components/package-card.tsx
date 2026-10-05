"use client";
import { messages } from "@/i18n/messages";
import { text,time } from "@/components/operator/format";
import { packageText } from "@/lib/skills/package-types";
import type { PackageResults } from "@/components/skills/package-model";
import { PackageFacts } from "@/components/skills/package-facts";
import { PackageEditor } from "@/components/skills/package-editor";
import "@/components/skills/packages.css";
const t=messages.packageSkills;
export function PackageCard({ skill, view, outdated, saved }: {
  skill: PackageResults["skills"][number]; view: PackageResults; outdated: boolean; saved: () => Promise<unknown>;
}) {
  const state=outdated && skill.state!=="disabled" ? "unknown" : skill.state;
  const reason=outdated ? t.unknown : skill.reason === "skill_assessment" ? skill.reason_text : (t.errors as Record<string,string>)[skill.reason] ?? t.unknown;
  const readings=view.readings.filter((r) => r.installation_id===skill.installation_id).slice(0,5);
  return <section className="tw-package-card" id={skill.key} tabIndex={-1} aria-labelledby={skill.installation_id+"-heading"}>
    <header><div><span className="tw-meta">{t.version} {skill.metadata.manifest.version}</span><h2 id={skill.installation_id+"-heading"}>{skill.name}</h2><p>{reason}</p></div>
      <span className={`tw-pill tw-tone-${state}`}>{(messages.dashboard.states as Record<string,string>)[state]}</span></header>
    {!outdated && skill.assessment ? <PackageFacts facts={skill.assessment.facts} catalog={skill.metadata.catalog} /> : null}
    <details><summary>{t.settings}</summary><PackageEditor id={skill.installation_id} metadata={skill.metadata} defaults={skill.defaults}
      revision={skill.source_revision} policy={{host:view.host_id,version:skill.policy_version,overrides:skill.overrides}} saved={saved} /></details>
    <details><summary>{t.history}</summary>{readings.map((reading) => {
      const catalog=view.catalogs.find((p) => p.content_sha256===reading.content_sha256)?.metadata.catalog;
      const assessment=reading.assessments[0];
      return <details key={reading.id}><summary>{time(reading.finished_at,true)}{messages.dashboard.separator}{catalog && assessment ? packageText(catalog,assessment.reason) : (t.errors as Record<string,string>)[reading.outcome] ?? t.unknown}</summary>
        <p className="tw-meta">{text(messages.server.dataMeta,{time:time(reading.received_at,true)})}</p>
        {catalog && assessment ? <PackageFacts facts={assessment.facts} catalog={catalog} /> : null}</details>;
    })}{!readings.length ? <p>{t.noReading}</p> : null}</details>
  </section>;
}
