"use client";
import { useState } from "react";
import { SkillOsFilter } from "./skill-os-filter";
import { text } from "@/components/operator/format";
import { order, category, cadence, t, type Skill, type SkillKey, type DraftReport } from "./skill-model";

export function SkillsCatalog({ skills, selected, pick, drafts }: { skills: Skill[]; selected: SkillKey;
  pick: (key: SkillKey) => void; drafts: Partial<Record<SkillKey, DraftReport>> }) {
  const [query, setQuery] = useState(""), [filter, setFilter] = useState("all");
  const [osSelected, setOsSelected] = useState(false);
  const q = query.trim().toLowerCase();
  const visible = order.map((key) => skills.find((s) => s.key === key)!).filter((s) =>
    (filter === "all" || s.enabled === (filter === "on")) && `${t.names[s.key]} ${category(s.key)} ${t.descriptions[s.key]}`.toLowerCase().includes(q));
  return <aside className="tw-skills-catalog" aria-label={t.title}>
    <div className="tw-skills-controls"><div className="tw-skill-search">
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10" cy="10" r="7" /><path d="m15 15 6 6" /></svg>
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={text(t.search, { total: skills.length })} aria-label={t.searchLabel} />
    </div><div className="tw-skill-filters">{(["all", "on", "off"] as const).map((key) => <button type="button" key={key}
      aria-pressed={filter === key} onClick={() => setFilter(key)}>{t[key]}<span className="tw-mono">{key === "all" ? skills.length : skills.filter((s) => s.enabled === (key === "on")).length}</span></button>)}</div>
    <SkillOsFilter selected={osSelected} select={setOsSelected} count={skills.length} /></div>
    <div className="tw-skills-list">{[t.storage, t.packages].map((group) => {
      const rows = visible.filter((s) => category(s.key) === group);
      return rows.length ? <div key={group}><h2 className="tw-meta">{group}<span>{rows.length}</span></h2>
        {rows.map((s) => <button type="button" key={s.key} aria-current={s.key === selected ? "true" : undefined} onClick={() => pick(s.key)}>
          <span><strong>{t.names[s.key]}</strong><span className="tw-meta">{s.enabled ? text(t.every, { time: cadence(s.values.interval_seconds) }) : t.offMeta}</span></span>
          {drafts[s.key]?.dirty ? <span className="tw-meta tw-skill-unsaved">{t.unsaved}</span> : null}
        </button>)}</div> : null;
    })}{!visible.length ? <div className="tw-skill-empty"><strong>{t.noMatch}</strong><p>{t.searchHelp}</p></div> : null}</div>
    <footer><button type="button" disabled title={t.marketplace}>{t.add}</button><span>{t.marketplace}</span></footer>
  </aside>;
}
