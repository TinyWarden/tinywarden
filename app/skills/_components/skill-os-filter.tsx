"use client";
import { useEffect, useRef, useState } from "react";
import { messages } from "@/i18n/messages";
import { PlaybookButton } from "@/components/playbook/controls";
const t = messages.skills;
export function SkillOsFilter({ selected, select, count }: { selected: boolean; select: (value: boolean) => void; count: number }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState("");
  const popup = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), search = useRef<HTMLInputElement>(null);
  function close() { setOpen(false); trigger.current?.focus(); }
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !popup.current?.contains(event.target)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div ref={popup} className="tw-skill-os"><PlaybookButton ref={trigger} type="button" variant="secondary" className="tw-btn--sm" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}>
    <span className="tw-meta">{t.os}</span><strong>{selected ? t.debian13 : t.anyOs}</strong><span aria-hidden="true">{open ? "▴" : "▾"}</span></PlaybookButton>
    {open ? <div role="dialog" aria-label={t.osFilter} className="tw-skill-os-popup">
      <input ref={search} className="tw-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t.osSearch} placeholder={t.osSearch} />
      <div className="tw-skill-os-columns tw-meta"><span>{t.compatible}</span><span>{t.title}</span></div>
      {t.debian13.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) ? <div><h3 className="tw-meta tw-skill-os-group">{t.debian}</h3>
        <label className="tw-check"><input type="checkbox" checked={selected} onChange={(event) => select(event.target.checked)} /><span>{t.debian13}</span><span className="tw-meta">{count}</span></label></div> : <p>{t.noMatch}</p>}
      <footer className="tw-btns"><PlaybookButton type="button" variant="secondary" className="tw-btn--xs" onClick={() => { select(false); setQuery(""); }}>{t.clear}</PlaybookButton><PlaybookButton type="button" className="tw-btn--xs" onClick={close}>{t.done}</PlaybookButton></footer>
    </div> : null}
  </div>;
}
