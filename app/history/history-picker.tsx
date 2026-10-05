"use client";
import { useEffect, useRef, useState } from "react";
import { text } from "@/components/operator/format";
import { validChanges } from "@/components/operator/read-validation";
import { permissionEvent } from "@/components/operator/use-operator-read";
import { h } from "./history-format";
export type Choice = { id: string; label: string; count: number };
export function HistoryPicker({ kind, options, total, selected, onChange, disabled }: {
  kind: "servers" | "skills"; options: Choice[]; total: number; selected: string[];
  onChange: (values: string[]) => void; disabled: boolean;
}) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState("");
  const [result, setResult] = useState<{ query: string; options: Choice[]; total: number; failed: boolean } | null>(null);
  const root = useRef<HTMLDivElement>(null), popover = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), input = useRef<HTMLInputElement>(null);
  const selection = selected.join(",");
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const position = () => {
      if (!popover.current || !root.current) return;
      const bounds = root.current.getBoundingClientRect(), width = popover.current.getBoundingClientRect().width;
      popover.current.style.left = Math.min(0, window.innerWidth - 20 - bounds.left - width) + "px";
    };
    position(); window.addEventListener("resize", position);
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { window.removeEventListener("resize", position); document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  useEffect(() => {
    if (!open || disabled || kind !== "servers" || !query.trim()) return;
    const controller = new AbortController(); let disposed = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const search = new URLSearchParams({ limit: "1", server_search: query.trim() });
          if (selection) search.set("hosts", selection);
          const response = await fetch("/api/v1/operator/history?" + search, { signal: controller.signal, credentials: "same-origin", cache: "no-store" });
          if (response.status === 401) { document.dispatchEvent(new Event(permissionEvent)); return; }
          const data: unknown = await response.json();
          if (!response.ok || !validChanges(data)) throw new Error("history_options_unavailable");
          if (!controller.signal.aborted) setResult({ query, options: data.filters.servers, total: data.filters.server_matches, failed: false });
        } catch { if (!disposed) setResult({ query, options: [], total: 0, failed: true }); }
      })();
    }, 250);
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    return () => { disposed = true; window.clearTimeout(timer); window.clearTimeout(timeout); controller.abort(); };
  }, [open, kind, query, selection, disabled]);
  function close() { setOpen(false); trigger.current?.focus(); }
  const remote = kind === "servers" && !!query.trim(), searched = result?.query === query;
  const loading = remote && !searched;
  const choices = (remote ? searched ? result.options : [] : options)
    .filter((o) => remote || o.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .sort((a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)) || Number(b.count > 0) - Number(a.count > 0) || a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  const matches = remote ? searched ? result.total : 0 : query ? choices.length : total;
  const label = selected.length === 1 ? options.find((o) => o.id === selected[0])?.label ?? h.selected.replace("{count}", "1")
    : text(selected.length ? kind === "servers" ? h.selectedServers : h.selectedSkills : h.all,
      { count: selected.length || total });
  return <div className="tw-history-picker" ref={root}>
    <button ref={trigger} type="button" className="tw-history-trigger" disabled={disabled} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => { setOpen(!open); setQuery(""); }}><span className="tw-meta">{h[kind]}</span><strong>{label}</strong>
      {selected.length > 1 ? <span className="tw-history-count">{selected.length}</span> : null}<span aria-hidden="true">{open ? h.upCaret : h.downCaret}</span></button>
    {open && !disabled ? <div ref={popover} role="dialog" aria-label={h[kind]} className="tw-history-popover">
      <div className="tw-history-search"><input ref={input} type="search" maxLength={80} value={query} aria-label={h[kind]}
        placeholder={text(kind === "servers" ? h.searchServers : h.searchSkills, { count: total })} onChange={(event) => setQuery(event.target.value)} /></div>
      <div className="tw-history-listhead tw-meta"><span>{query ? text(h.matches, { count: matches }) : h.listHead}</span><span>{h.events}</span></div>
      <div className="tw-history-choices" aria-busy={loading}>
        {choices.map((o) => <label key={o.id} className={o.count ? "" : "tw-history-zero"}>
          <input type="checkbox" checked={selected.includes(o.id)} disabled={kind === "servers" && selected.length >= 50 && !selected.includes(o.id)}
            onChange={() => onChange(selected.includes(o.id) ? selected.filter((id) => id !== o.id) : [...selected, o.id])} />
          <span className={kind === "servers" ? "tw-host-name" : ""}>{o.label}</span><span className="tw-meta">{o.count || h.zero}</span></label>)}
        {loading ? <p role="status">{h.searching}</p> : remote && searched && result.failed ? <p role="alert">{h.optionUnavailable}</p>
          : !choices.length ? <p>{text(h.noMatches, { query })}</p> : null}
      </div>
      {matches > choices.length && !loading ? <p className="tw-history-limit">{text(h.moreServers, { count: choices.length, total: matches })}</p> : null}
      {kind === "servers" && selected.length >= 50 ? <p className="tw-history-limit">{h.selectionLimit}</p> : null}
      <div className="tw-history-popfooter"><span className="tw-meta">{selected.length ? text(h.selected, { count: selected.length }) : h.noneSelected}</span>
        <button type="button" onClick={() => onChange([])}>{h.clear}</button><button type="button" onClick={close}>{h.done}</button></div>
    </div> : null}
  </div>;
}
