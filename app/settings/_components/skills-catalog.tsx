"use client";
import { useEffect, useRef, useState } from "react";
import { text } from "@/components/operator/format";
import { order, category, cadence, t, type Skill, type SkillKey, type DraftReport } from "./skill-model";

export function SkillsCatalog({ skills, selected, pick, drafts }: { skills: Skill[]; selected: SkillKey;
  pick: (key: SkillKey) => void; drafts: Partial<Record<SkillKey, DraftReport>> }) {
  const [query, setQuery] = useState(""), [filter, setFilter] = useState("all");
  const [osOpen, setOsOpen] = useState(false), [osSelected, setOsSelected] = useState(false), [osQuery, setOsQuery] = useState("");
  const popup = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!osOpen) return;
    search.current?.focus();
    const outside = (e: PointerEvent) => { if (e.target instanceof Node && !popup.current?.contains(e.target)) setOsOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOsOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [osOpen]);
  const q = query.trim().toLowerCase();
  const visible = order.map((key) => skills.find((s) => s.key === key)!).filter((s) =>
    (filter === "all" || s.enabled === (filter === "on")) && `${t.names[s.key]} ${category(s.key)} ${t.descriptions[s.key]}`.toLowerCase().includes(q));
  const osMatches = t.debian13.toLowerCase().includes(osQuery.trim().toLowerCase());
  return <aside className="tw-skills-catalog" aria-label={t.title}>
    <div className="tw-skills-controls"><div className="tw-skill-search">
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10" cy="10" r="7" /><path d="m15 15 6 6" /></svg>
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={text(t.search, { total: skills.length })} aria-label={t.searchLabel} />
    </div><div className="tw-skill-filters">{(["all", "on", "off"] as const).map((key) => <button type="button" key={key}
      aria-pressed={filter === key} onClick={() => setFilter(key)}>{t[key]}<span className="tw-mono">{key === "all" ? skills.length : skills.filter((s) => s.enabled === (key === "on")).length}</span></button>)}</div>
    <div ref={popup} className="tw-skill-os"><button ref={trigger} type="button" aria-expanded={osOpen} aria-haspopup="dialog" onClick={() => setOsOpen(!osOpen)}>
      <span className="tw-meta">{t.os}</span><strong>{osSelected ? t.debian13 : t.anyOs}</strong><span aria-hidden="true">{osOpen ? "▴" : "▾"}</span></button>
      {osOpen ? <div role="dialog" aria-label={t.osFilter} className="tw-skill-os-popup">
        <input ref={search} type="search" value={osQuery} onChange={(e) => setOsQuery(e.target.value)} aria-label={t.osSearch} placeholder={t.osSearch} />
        <div className="tw-skill-os-columns tw-meta"><span>{t.compatible}</span><span>{t.title}</span></div>
        {osMatches ? <div><h3 className="tw-meta tw-skill-os-group">{t.debian}</h3>
          <label><input type="checkbox" checked={osSelected} onChange={(e) => setOsSelected(e.target.checked)} /><span>{t.debian13}</span><span className="tw-meta">{skills.length}</span></label></div>
          : <p>{t.noMatch}</p>}
        <footer><button type="button" onClick={() => { setOsSelected(false); setOsQuery(""); }}>{t.clear}</button>
          <button type="button" onClick={() => { setOsOpen(false); trigger.current?.focus(); }}>{t.done}</button></footer>
      </div> : null}</div></div>
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
