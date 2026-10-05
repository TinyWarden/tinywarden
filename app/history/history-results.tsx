"use client";
import { useEffect, useRef, useState } from "react";
import { ReadNotice } from "@/components/operator/shell";
import { useOperatorRead, permissionEvent } from "@/components/operator/use-operator-read";
import { validChanges } from "@/components/operator/read-validation";
import { m, text, time, type ChangeView, type EventView } from "@/components/operator/format";
import { HistoryTimeline } from "./history-timeline";
import { h } from "./history-format";
export type HistoryStatus = { value: ChangeView | null; busy: boolean; expired: boolean; base: string };
const identity = (value: ChangeView | null) => JSON.stringify([value?.events.map((e) => e.id), value?.next_cursor]);
export function HistoryResults({ base, refresh, report, clear }: {
  base: string; refresh: number; report: (status: HistoryStatus) => void; clear: () => void;
}) {
  const read = useOperatorRead(base, validChanges), controller = useRef<AbortController | null>(null);
  const [older, setOlder] = useState<{ head: string; events: EventView[]; next: string | null } | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false), [olderFailed, setOlderFailed] = useState(false);
  const load = read.load, lastRefresh = useRef(refresh);
  const head = identity(read.value), activeOlder = older?.head === head ? older : null;
  const next = activeOlder ? activeOlder.next : read.value?.next_cursor;
  useEffect(() => { report({ value: read.value, busy: read.busy || loadingOlder, expired: read.expired, base }); },
    [read.value, read.busy, read.expired, loadingOlder, base, report]);
  useEffect(() => { controller.current?.abort(); return () => controller.current?.abort(); }, [head, read.expired]);
  useEffect(() => { if (refresh !== lastRefresh.current) { lastRefresh.current = refresh; void load(base); } }, [refresh, base, load]);
  async function loadOlder() {
    if (!next || !read.value || controller.current || read.busy || read.expired) return;
    const request = new AbortController(); controller.current = request; setLoadingOlder(true); setOlderFailed(false);
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; request.abort(); }, 15000);
    try {
      const response = await fetch(base + "&cursor=" + encodeURIComponent(next), { credentials: "same-origin", cache: "no-store", signal: request.signal });
      if (response.status === 401) { document.dispatchEvent(new Event(permissionEvent)); return; }
      const data: unknown = await response.json();
      if (!response.ok || !validChanges(data)) throw new Error("history_older_unavailable");
      if (!request.signal.aborted) setOlder({ head, events: [...(activeOlder?.events ?? []), ...data.events], next: data.next_cursor });
    } catch { if (!request.signal.aborted || timedOut) setOlderFailed(true); }
    finally { window.clearTimeout(timeout); if (controller.current === request) controller.current = null; setLoadingOlder(false); }
  }
  const unique = new Map<string, EventView>();
  for (const event of [...(read.value?.events ?? []), ...(activeOlder?.events ?? [])])
    if (read.value && event.observed_at >= read.value.filters.retained_from && event.observed_at <= read.value.as_of) unique.set(event.id, event);
  const events = [...unique.values()].sort((a, b) => b.observed_at.localeCompare(a.observed_at) || b.id.localeCompare(a.id));
  return <>
    <ReadNotice expired={read.expired} failed={read.failed} loaded={!!read.value} />
    {!read.expired && !read.value && !read.failed ? <p role="status" className="tw-history-loading">{h.countPending}</p> : null}
    {!read.expired && read.value ? <>
      {read.value.capture.lagging ? <p role="status" className="tw-history-notice">{read.value.capture.activated_at ? m.historyLagging : m.captureNotStarted}</p> : null}
      <div className="tw-history-timeline" aria-label={m.historyTitle}>
        {events.length ? <HistoryTimeline events={events} asOf={read.value.as_of} /> : <div className="tw-history-empty">
          <h2>{h.emptyTitle}</h2><p>{h.emptyHelp}</p><button type="button" onClick={clear}>{h.clearFilters}</button></div>}
        {next ? <button className="tw-history-older" type="button" disabled={loadingOlder || read.busy} onClick={() => void loadOlder()}>{loadingOlder ? m.refreshing : h.older}</button> : null}
      </div>
      {olderFailed ? <p role="alert" className="tw-history-notice">{h.olderFailed}</p> : null}
      <footer className="tw-history-footer tw-meta"><span>{h.retention}</span>
        {read.value.capture.activated_at ? <span>{text(h.capture, { time: time(read.value.capture.activated_at, true) })}</span> : null}</footer>
    </> : null}
  </>;
}
