"use client";
import {useIsAdmin} from "@/components/operator/session-provider";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { FleetGroup } from "@/server/fleet/dashboard-model";
import { OperatorShell, ReadNotice } from "@/components/operator/shell";
import { useFleetRead } from "@/components/operator/fleet-status";
import { m, text } from "@/components/operator/format";
import { FleetHero } from "@/components/operator/fleet-hero";
import { FleetGroups } from "@/components/operator/fleet-groups";
import {AddServer} from "@/components/operator/add-server";
import {DashboardEditor} from "@/components/operator/dashboard-editor";
import {PlaybookButton} from "@/components/playbook/controls";
import {PlaybookIcon} from "@/components/playbook/skill";
import {messages} from "@/i18n/messages";
import { ChangeEvents } from "@/components/operator/change-events";
const emptyPages = (): Record<FleetGroup, (string | null)[]> => ({ attention: [], unknown: [], healthy: [] });
export function FleetClient() {
  const admin=useIsAdmin();
  const read = useFleetRead(), load = read.load;
  const [customize,setCustomize]=useState(false);
  const [adding,setAdding]=useState(false);
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
  const history = read.value?.history, panel = !!history && history.count > 0 && !read.dayExpired && read.value?.layout.sections.some(s=>s.type==="change_feed"&&s.visible);
  return <OperatorShell active="dashboard" asOf={read.value?.as_of}>
    <main id="main" tabIndex={-1}>
      {!read.expired ? <FleetHero viewer={!admin} view={read.value} busy={read.busy} outdated={read.outdated} refresh={() => void refresh()} /> : null}
      <div className="tw-main"><ReadNotice expired={read.expired} failed={read.failed} outdated={read.outdated} loaded={!!read.value} />
        {!read.expired && read.busy && !read.value ? <p role="status">{m.loading}</p> : null}
        {!read.expired && read.value ? <>
          {read.value.layout.sections.some(s=>s.type==="change_feed"&&s.visible) ? !history ? <p className="tw-history-notice" role="status">{m.historyUnavailable}<Link href="/history">{m.fullHistory}</Link></p>
            : read.dayExpired ? <p className="tw-history-notice" role="status">{m.midnightRefresh}</p> : history.lagging ? <p className="tw-history-notice" role="status">{history.activated_at ? m.historyLagging : m.captureNotStarted}</p> : null : null}
          <div className="tw-ui tw-dashboard-toolbar"><div className="tw-btns">{read.value.fleet_management.paused>0?<Link className="tw-link" href="/fleet?lifecycle=paused">{text(messages.fleetManagement.pausedCounts,{count:read.value.fleet_management.paused})}</Link>:null}{read.value.fleet_management.maintenance>0?<Link className="tw-link" href="/fleet?maintenance=active">{text(messages.fleetManagement.maintenanceCounts,{count:read.value.fleet_management.maintenance})}</Link>:null}{admin?<PlaybookButton className="tw-btn--sm" aria-haspopup="dialog" onClick={()=>setAdding(true)}>{messages.addServer.title}</PlaybookButton>:null}<PlaybookButton variant="secondary" className="tw-btn--sm" aria-haspopup="dialog" onClick={()=>setCustomize(true)}><PlaybookIcon name="settings"/>{messages.dashboardCustomize.title}</PlaybookButton></div></div>
          <div className={`tw-fleet-layout${panel ? " tw-with-changes" : ""}`}>
            <FleetGroups view={read.value} busy={read.busy} outdated={read.outdated} pages={pages} next={(g) => void move(g, false)} previous={(g) => void move(g, true)} />
            {panel ? <aside className="tw-changes" aria-labelledby="changes-heading"><header><h2 id="changes-heading">{m.changesTitle}</h2>
              <p className="tw-meta">{text(m.changesMeta, { count: history.count })}</p></header><ChangeEvents events={history.events} />
              <Link className="tw-history-link" href="/history">{m.fullHistory}{m.separator}{m.arrow}</Link></aside> : null}
          </div>
        </> : null}
      </div>
      {adding?<AddServer close={()=>setAdding(false)}/>:null}
      {customize?<DashboardEditor close={()=>setCustomize(false)} saved={async()=>{cursors.current={};setPages(emptyPages());await read.reload("/api/v1/operator/dashboard");}}/>:null}
    </main>
  </OperatorShell>;
}
