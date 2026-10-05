"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { FleetGroup } from "@/server/fleet/dashboard-model";
import { OperatorShell, ReadNotice } from "@/components/operator/shell";
import { useFleetRead } from "@/components/operator/fleet-status";
import { m, text, time } from "@/components/operator/format";
import { FleetHero } from "@/components/operator/fleet-hero";
import { FleetGroups } from "@/components/operator/fleet-groups";
import { ChangeEvents } from "@/components/operator/change-events";
const emptyPages = (): Record<FleetGroup, (string | null)[]> => ({ attention: [], unknown: [], healthy: [] });
export function FleetClient() {
  const read = useFleetRead(), load = read.load;
  const cursors = useRef<Partial<Record<FleetGroup, string>>>({}), [pages, setPages] = useState(emptyPages);
  useEffect(() => {
    const reset = window.setTimeout(() => { void load("/api/v1/operator/dashboard"); }, 0);
    return () => { window.clearTimeout(reset); };
  }, [load]);
  async function move(group: FleetGroup, backwards: boolean) {
    const target = backwards ? pages[group].at(-1) : read.value?.groups[group].next_cursor;
    if (read.busy || target === undefined || target === null && !backwards) return;
    const next = { ...cursors.current }; if (target) next[group] = target; else delete next[group];
    const query = new URLSearchParams(next).toString();
    if (await read.load("/api/v1/operator/dashboard" + (query ? "?" + query : ""))) {
      const prior = cursors.current[group] ?? null; cursors.current = next;
      setPages((old) => ({ ...old, [group]: backwards ? old[group].slice(0, -1) : [...old[group], prior] }));
    }
  }
  async function refresh() {
    if (await read.load("/api/v1/operator/dashboard")) { cursors.current = {}; setPages(emptyPages()); }
  }
  const history = read.value?.history, panel = !!history && history.count > 0 && !read.dayExpired;
  return <OperatorShell active="servers" asOf={read.value?.as_of}>
    <main id="main" tabIndex={-1}>
      {!read.expired ? <FleetHero view={read.value} busy={read.busy} outdated={read.outdated} refresh={() => void refresh()} /> : null}
      <div className="tw-main"><ReadNotice expired={read.expired} failed={read.failed} outdated={read.outdated} loaded={!!read.value} />
        {!read.expired && read.busy && !read.value ? <p role="status">{m.loading}</p> : null}
        {!read.expired && read.value ? <>
          {!history ? <p className="tw-history-notice" role="status">{m.historyUnavailable}<Link href="/history">{m.fullHistory}</Link></p>
            : read.dayExpired ? <p className="tw-history-notice" role="status">{m.midnightRefresh}</p> : history.lagging ? <p className="tw-history-notice" role="status">{history.activated_at ? m.historyLagging : m.captureNotStarted}</p> : null}
          <div className={`tw-fleet-layout${panel ? " tw-with-changes" : ""}`}>
            <FleetGroups view={read.value} busy={read.busy} outdated={read.outdated} pages={pages} next={(g) => void move(g, false)} previous={(g) => void move(g, true)} />
            {panel ? <aside className="tw-changes" aria-labelledby="changes-heading"><header><h2 id="changes-heading">{m.changesTitle}</h2>
              <p className="tw-meta">{text(m.changesMeta, { count: history.count })}</p></header><ChangeEvents events={history.events} />
              <Link className="tw-history-link" href="/history">{m.fullHistory}{m.separator}{m.arrow}</Link></aside> : null}
          </div>
          <footer className="tw-page-footer"><span>{text(m.asOf, { time: time(read.value.as_of, true) })}</span><span>{m.continuity}</span></footer>
        </> : null}
      </div>
    </main>
  </OperatorShell>;
}
