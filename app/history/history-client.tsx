"use client";
import { useCallback, useState } from "react";
import { OperatorShell } from "@/components/operator/shell";
import { m, text, time, type ChangeView } from "@/components/operator/format";
import { PlaybookButton } from "@/components/playbook/controls";
import { HistoryPicker, type Choice } from "./history-picker";
import { HistoryResults, type HistoryStatus } from "./history-results";
import { h, historyRange } from "./history-format";
type Kind = keyof typeof h.kinds;
export function HistoryClient({ host }: { host?: string | undefined }) {
  const [hosts, setHosts] = useState<string[]>(host ? [host] : []), [skills, setSkills] = useState<string[]>([]), [kind, setKind] = useState<Kind>("all");
  const [status, setStatus] = useState<HistoryStatus | null>(null), [inventory, setInventory] = useState<ChangeView["filters"] | null>(null);
  const [refresh, setRefresh] = useState(0);
  const params = new URLSearchParams({ limit: "25" });
  if (hosts.length) params.set("hosts", [...hosts].sort().join(","));
  if (skills.length) params.set("skills", [...skills].sort().join(","));
  if (kind !== "all") params.set("kind", kind);
  const base = "/api/v1/operator/history?" + params;
  const report = useCallback((next: HistoryStatus) => {
    setStatus(next);
    if (next.expired) setInventory(null); else if (next.value) setInventory(next.value.filters);
  }, []);
  const clear = useCallback(() => { setHosts([]); setSkills([]); setKind("all"); }, []);
  const value = status?.base === base ? status.value : null;
  const disabled = status?.expired ?? false, busy = status?.base !== base || !!status?.busy;
  const serverOptions: Choice[] = inventory?.servers ?? [];
  const skillOptions: Choice[] = (inventory?.skills ?? []).map((o) => ({ id: o.key, label: o.label ?? (h.skillNames as Record<string,string>)[o.key] ?? o.key, count: o.count }));
  const active = [...hosts.map((id) => ({ id, label: serverOptions.find((o) => o.id === id)?.label ?? id, kind: h.server, remove: () => setHosts(hosts.filter((v) => v !== id)) })),
    ...skills.map((id) => ({ id, label: skillOptions.find((o) => o.id === id)?.label ?? id, kind: h.skill, remove: () => setSkills(skills.filter((v) => v !== id)) }))];
  return <OperatorShell active="history" asOf={value?.as_of}><main id="main" tabIndex={-1} className="tw-main tw-ui tw-history-page">
    <header className="tw-history-heading"><div><p className="tw-meta">{h.window}{m.separator}{value ? text(h.updated, { time: time(value.as_of) }) : h.countPending}{m.separator}{h.poll}</p>
      <h1 className="tw-t-page">{m.historyTitle}</h1><p className="tw-history-intro">{h.help}</p></div>
      <PlaybookButton variant="secondary" className="tw-btn--sm" type="button" disabled={busy || disabled} onClick={() => setRefresh((v) => v + 1)}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7a9 9 0 0 0-15-2L3 8m0-5v5h5M4 17a9 9 0 0 0 15 2l2-3m0 5v-5h-5" /></svg>{busy ? m.refreshing : h.refresh}</PlaybookButton></header>
    <div className="tw-history-filters"><div className="tw-history-filterrow">
      <HistoryPicker kind="servers" options={serverOptions} total={inventory?.server_matches ?? 0} selected={hosts} onChange={setHosts} disabled={disabled || !inventory} />
      <HistoryPicker kind="skills" options={skillOptions} total={skillOptions.length} selected={skills} onChange={setSkills} disabled={disabled || !inventory} />
      <span className="tw-history-divider" aria-hidden="true" />
      <div className="tw-history-kind"><span className="tw-meta">{h.show}</span><div className="tw-seg" role="group" aria-label={h.eventType}>
        {(Object.keys(h.kinds) as Kind[]).map((key) => <button className="tw-seg__opt" key={key} type="button" aria-pressed={kind === key} disabled={disabled} onClick={() => setKind(key)}>{h.kinds[key]}</button>)}</div></div>
      <span className="tw-meta tw-history-total" role="status">{value ? value.filters.totals.events ? text(h.rangeTotal, {
        events: text(value.filters.totals.events === 1 ? h.eventOne : h.eventOther, { count: value.filters.totals.events }),
        range: historyRange(value.filters.earliest_match_at!, value.filters.latest_match_at!),
      }) : text(h.eventOther, { count: 0 }) : h.countPending}</span>
    </div>{active.length || kind !== "all" ? <div className="tw-actives tw-history-active"><span className="tw-meta">{h.active}</span>
      {active.map((a) => <button className="tw-active" key={a.id} type="button" disabled={disabled} onClick={a.remove} aria-label={text(h.remove, { name: a.label })}>
        <span className="tw-active__key">{a.kind}</span><strong className={`tw-active__value${a.kind === h.server ? " tw-host-name" : ""}`}>{a.label}</strong><span className="tw-active__x" aria-hidden="true">{h.close}</span></button>)}
      <button className="tw-textbtn" type="button" disabled={disabled} onClick={clear}>{h.clearFilters}</button></div> : null}</div>
    <HistoryResults key={base} base={base} refresh={refresh} report={report} clear={clear} />
  </main></OperatorShell>;
}
