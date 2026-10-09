"use client";
import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { messages } from "@/i18n/messages";
import { OperatorShell, ReadNotice } from "@/components/operator/shell";
import { text, time } from "@/components/operator/format";
import { useOperatorRead } from "@/components/operator/use-operator-read";
import { packageText } from "@/lib/skills/package-types";
import { PackageEditor } from "@/components/skills/package-editor";
import type { PackageList, InstalledPackage } from "@/components/skills/package-model";
import { usePackageCommand } from "@/components/skills/use-package-command";
import { PackageUpload } from "@/components/skills/package-upload";
import { PackagePermissions } from "@/components/skills/package-permissions";
import { PackageIdentity } from "@/components/skills/package-identity";
import { Disclosure, PlaybookIcon } from "@/components/playbook/skill";
import { PlaybookButton } from "@/components/playbook/controls";
import { SkillDescription } from "./skill-description";
import { SkillOsFilter } from "./skill-os-filter";
import { cadence } from "./skill-model";
import "@/components/skills/packages.css";
const t = messages.skills, p = messages.packageSkills;
function name(skill: InstalledPackage) { return packageText(skill.metadata.catalog,{key:skill.metadata.manifest.name_key,params:{}}); }
export function PackageSettings({ read }: { read: ReturnType<typeof useOperatorRead<PackageList>> }) {
  const command = usePackageCommand();
  const requested = useSearchParams().get("skill"), [selected,setSelected] = useState(requested ?? "");
  const [query,setQuery] = useState(""), [filter,setFilter] = useState("all"), [os,setOs] = useState(false);
  const [dirty,setDirty] = useState(false), [usage,setUsage] = useState(false);
  const [editorLocked,setEditorLocked] = useState(false);
  const [uploadLocked,setUploadLocked]=useState(false),[review,setReview]=useState(false);
  const dirtyReport = useCallback((v: boolean) => setDirty(v), []);
  const skills = read.value?.skills ?? [], skill = skills.find((s) => s.id === selected || s.subject_key === selected) ?? skills[0];
  const count = skills.filter((s) => s.enabled).length, q = query.trim().toLocaleLowerCase();
  const visible = skills.filter((s) => (filter === "all" || s.enabled === (filter === "on")) &&
    `${name(s)} ${s.metadata.manifest.category}`.toLocaleLowerCase().includes(q) && (!os || s.metadata.manifest.compatibility.os.includes("debian:13")));
  const pick = (id: string) => { if (!editorLocked && !uploadLocked && (!dirty || window.confirm(messages.checks.discardConfirm))) {setSelected(id);setDirty(false);setUsage(false);setReview(false);} };
  const reload = read.reload;
  const saved = useCallback(async () => { await reload(); },[reload]);
  const busy = command.busy || command.uncertain || editorLocked || uploadLocked || read.expired;
  async function toggle() {
    if (!skill) return;
    const ok=await command.send(`/api/v2/operator/skills/${skill.id}/enabled`,{ expected_enablement_version:skill.enablement_version,
      content_sha256:skill.content_sha256, enabled:!skill.enabled,grants:skill.metadata.manifest.capabilities },saved);
    if(ok)setReview(false);
  }
  const usageSteps = skill ? Object.entries(skill.metadata.catalog).filter(([key]) => key.startsWith("usage.")).sort(([a],[b]) => a.localeCompare(b)) : [];
  return <OperatorShell active="settings" asOf={read.value?.as_of}><main id="main" tabIndex={-1} className="tw-ui tw-main tw-skills">
    <header className="tw-skills-heading"><span className="tw-meta">{text(t.installed,{total:skills.length,on:count,off:skills.length-count})}</span><h1>{t.title}</h1><p>{t.help}</p></header>
    <ReadNotice expired={read.expired} failed={read.failed} loaded={!!read.value} />
    {command.notice ? <p className="tw-notice" role="status">{command.notice}{command.uncertain ? <PlaybookButton disabled={command.busy} onClick={() => void toggle()}>{p.retry}</PlaybookButton> : null}</p> : null}
    {read.value && !read.expired ? <div className="tw-skills-layout"><aside className="tw-skills-catalog" aria-label={t.title}>
      <div className="tw-skills-controls"><div className="tw-search tw-search--plain"><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t.searchLabel} placeholder={text(t.search,{total:skills.length})} /></div>
        <div className="tw-seg tw-skill-filters">{["all","on","off"].map((key) => <button type="button" className="tw-seg__opt" key={key} onClick={() => setFilter(key)} aria-pressed={filter === key}>{(t as Record<string,unknown>)[key] as string}<span className="tw-meta">{key === "all" ? skills.length : skills.filter((s) => s.enabled === (key === "on")).length}</span></button>)}</div>
        <SkillOsFilter selected={os} select={setOs} count={skills.filter((s) => s.metadata.manifest.compatibility.os.includes("debian:13")).length} />
      </div><div className="tw-skills-list">{[...new Set(visible.map((s) => s.metadata.manifest.category))].map((category) => <div key={category}>
        <h2 className="tw-meta">{category}</h2>{visible.filter((s) => s.metadata.manifest.category === category).map((s) => <button key={s.id} disabled={busy} aria-current={s.id === skill?.id ? "true" : undefined} onClick={() => pick(s.id)}>
          <span><strong>{name(s)}</strong><span className="tw-meta">{s.enabled ? text(t.every,{time:cadence(Number(s.defaults.interval_seconds ?? 300))}) : t.offMeta}</span></span>
        </button>)}</div>)}{!visible.length ? <p>{t.noMatch}</p> : null}</div>
      <footer><PackageUpload skills={skills} disabled={busy&&!uploadLocked||dirty||read.failed} saved={saved} onLocked={setUploadLocked} /></footer>
    </aside>{skill ? <section className="tw-skill-detail" aria-label={name(skill)}><div className="tw-skill-card">
      <header className="tw-skill-heading"><div><span className="tw-meta">{p.package}{messages.dashboard.separator}{p.version} {skill.metadata.manifest.version}{messages.dashboard.separator}{time(skill.updated_at,true)}</span><h2>{name(skill)}</h2>
        <div className="tw-package-publisher"><span className="tw-package-origin" data-official={skill.official === true}>{skill.official === true ? p.official : p.community}</span>
          <span>{text(p.byPublisher,{name:skill.metadata.manifest.publisher})}{messages.dashboard.separator}{skill.metadata.manifest.license}</span></div></div>
        <div className="tw-switch"><span>{skill.enabled ? t.onLabel : t.offLabel}</span><button type="button" role="switch" aria-checked={skill.enabled} aria-label={text(t.toggle,{name:name(skill)})} disabled={busy || read.failed || dirty} className="tw-toggle" onClick={() => skill.enabled?void toggle():setReview(true)} /></div>
      </header><SkillDescription key={skill.id}>{packageText(skill.metadata.catalog,{key:skill.metadata.manifest.description_key,params:{}})}</SkillDescription>
      <div className="tw-skill-compatibility"><span className="tw-meta">{t.compatible}</span><div><strong>{t.debian}</strong><span className="tw-mono">{t.debian13Version}</span></div></div>
      {!skill.enabled ? <p className="tw-skill-off-note">{t.offNote}</p> : null}<PackagePermissions key={`${skill.id}-${review}`} metadata={skill.metadata} open={review} />
      {review&&!skill.enabled?<section className="tw-package-review" aria-label={p.reviewEnable}><h3>{p.reviewEnable}</h3><p>{p.approveHelp}</p>
        <div className="tw-btns"><PlaybookButton disabled={busy||dirty||read.failed} onClick={()=>void toggle()}>{p.enableVersion}</PlaybookButton><PlaybookButton variant="secondary" disabled={command.busy||command.uncertain} onClick={()=>setReview(false)}>{p.cancel}</PlaybookButton></div></section>:null}
      <PackageIdentity digest={skill.content_sha256} />
    </div>{usageSteps.length ? <div className="tw-skill-card tw-skill-usage"><Disclosure title={t.usage} meta={text(p.usageSteps,{count:usageSteps.length})} icon={<PlaybookIcon name="book" />} plain open={usage} onOpen={setUsage}>
      <ol>{usageSteps.map(([key,entry]) => <li key={key}>{entry.text}</li>)}</ol></Disclosure></div> : null}
    <div className="tw-skill-card"><PackageEditor key={skill.id} id={skill.id} metadata={skill.metadata} defaults={skill.defaults} revision={skill.settings_revision} saved={saved} onDirty={dirtyReport} onLocked={setEditorLocked} showHelp={false} /></div>
    <p className="tw-skill-delivery-note">{t.deliveryNote} {p.defaultsHelp}</p></section> : null}</div> : null}
  </main></OperatorShell>;
}
