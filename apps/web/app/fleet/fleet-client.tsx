"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckPolicyEditor } from "./check-policy-editor";
import { BaselineEditors } from "./baseline-editor";
import { locale, messages } from "@/i18n/messages";
import { Badge } from "@/components/ui/badge";

interface Host {
  host_id: string; agent_id: string; label: string; reported_hostname: string;
  os_id: string; os_version: string; architecture: string; agent_version: string;
  contact_state: "current" | "stale" | "unknown" | "revoked";
  last_contact_at: string | null; stale_at: string | null;
  health_state: "unknown"; created_at: string;
}
interface Page { as_of: string; hosts: Host[]; next_cursor: string | null; receivedAt: number; requestMs: number }

const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
function date(value: string | null): string {
  return value ? dateFormat.format(new Date(value)) + " " + messages.fleet.utc : messages.fleet.never;
}
function instant(value: unknown): value is string {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.getUTCFullYear() >= 1 &&
    parsed.toISOString() === value;
}
function validPage(value: unknown): value is Omit<Page, "receivedAt" | "requestMs"> & { schema_version: 1 } {
  if (!value || typeof value !== "object") return false;
  const page = value as Record<string, unknown>;
  return page.schema_version === 1 && instant(page.as_of) && Array.isArray(page.hosts) &&
    page.hosts.length <= 25 && (page.next_cursor === null ||
      (typeof page.next_cursor === "string" && page.next_cursor.length <= 256)) &&
    page.hosts.every((host: unknown) => {
      if (!host || typeof host !== "object") return false;
      const row = host as Record<string, unknown>;
      return typeof row.host_id === "string" && typeof row.agent_id === "string" &&
        typeof row.label === "string" && typeof row.reported_hostname === "string" &&
        typeof row.os_id === "string" && typeof row.os_version === "string" &&
        typeof row.architecture === "string" && typeof row.agent_version === "string" &&
        typeof row.heartbeat_interval_seconds === "number" &&
        typeof row.stale_after_seconds === "number" && instant(row.created_at) &&
        ["current", "stale", "unknown", "revoked"].includes(String(row.contact_state)) &&
        row.health_state === "unknown" &&
        (row.last_contact_at === null || instant(row.last_contact_at)) &&
        (row.stale_at === null || instant(row.stale_at));
    });
}

function contactLabel(host: Host, page: Page, currentTime: number, failed: boolean): string {
  if (host.contact_state !== "current") return messages.fleet[host.contact_state];
  if (failed || !host.stale_at) return messages.fleet.statusOutdated;
  const remaining = Date.parse(host.stale_at) - Date.parse(page.as_of) - page.requestMs;
  return currentTime - page.receivedAt >= Math.max(0, remaining)
    ? messages.fleet.statusOutdated : messages.fleet.current;
}
function contactStyle(label: string): string {
  if (label === messages.fleet.current) return "bg-emerald-50 text-emerald-800";
  if (label === messages.fleet.stale) return "bg-rose-50 text-rose-700";
  if (label === messages.fleet.statusOutdated) return "bg-amber-50 text-amber-800";
  return "bg-muted text-foreground";
}

export function FleetClient() {
  const router = useRouter();
  const [page, setPage] = useState<Page | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<(string | null)[]>([]);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const [expired, setExpired] = useState(false);
  const [tick, setTick] = useState(0);
  const inFlight = useRef<AbortController | null>(null);
  const requestID = useRef(0);
  const expiredRef = useRef(false);
  const cursorRef = useRef<string | null>(null);
  const pageRef = useRef<Page | null>(null);
  const lastDeadlineRefresh = useRef(-Infinity);

  const load = useCallback(async (target: string | null = cursorRef.current): Promise<boolean> => {
    if (expiredRef.current || document.hidden || inFlight.current) return false;
    const controller = new AbortController();
    inFlight.current = controller;
    const id = ++requestID.current;
    const started = performance.now();
    // Covers headers and body; a stalled body must also release the polling slot.
    const deadline = window.setTimeout(() => controller.abort(), 15_000);
    setBusy(true);
    try {
      const query = target ? "?limit=25&cursor=" + encodeURIComponent(target) : "?limit=25";
      const response = await fetch("/api/v1/operator/hosts" + query,
        { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (id !== requestID.current || expiredRef.current || controller.signal.aborted) return false;
      if (response.status === 401) {
        expiredRef.current = true;
        setExpired(true);
        setPage(null);
        pageRef.current = null;
        setFailed(false);
        return false;
      }
      if (!response.ok) throw new Error("fleet_unavailable");
      const value: unknown = await response.json();
      if (!validPage(value)) throw new Error("fleet_invalid");
      if (id !== requestID.current || expiredRef.current || controller.signal.aborted) return false;
      const finished = performance.now();
      const loaded = { ...value, receivedAt: finished, requestMs: finished - started };
      pageRef.current = loaded;
      setPage(loaded);
      setTick(finished);
      setFailed(false);
      setCursor(target);
      cursorRef.current = target;
      return true;
    } catch {
      if (id === requestID.current && !expiredRef.current) setFailed(true);
      return false;
    } finally {
      window.clearTimeout(deadline);
      if (inFlight.current === controller) inFlight.current = null;
      if (id === requestID.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => { void load(null); }, 0);
    const requestCounter = requestID;
    let lastPoll = performance.now();
    const interval = window.setInterval(() => {
      if (document.hidden || expiredRef.current) return;
      const now = performance.now();
      setTick(now);
      const current = pageRef.current;
      const deadline = current?.hosts.filter((host) => host.contact_state === "current" && host.stale_at)
        .map((host) => current.receivedAt + Math.max(0,
          Date.parse(host.stale_at!) - Date.parse(current.as_of) - current.requestMs))
        .reduce((smallest, value) => Math.min(smallest, value), Infinity);
      if ((deadline !== undefined && now >= deadline && now - lastDeadlineRefresh.current >= 30_000)
          || now - lastPoll >= 30_000) {
        lastDeadlineRefresh.current = now;
        lastPoll = now;
        void load();
      }
    }, 1000);
    const visible = () => { if (!document.hidden && !expiredRef.current) {
      setTick(performance.now()); void load();
    } };
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
      window.clearTimeout(initial);
      requestCounter.current++;
      inFlight.current?.abort();
    };
  }, [load]);

  async function next() {
    if (!page?.next_cursor || busy) return;
    if (await load(page.next_cursor)) setHistory((current) => [...current, cursor]);
  }
  async function previous() {
    if (!history.length || busy) return;
    const target = history[history.length - 1]!;
    if (await load(target)) setHistory((current) => current.slice(0, -1));
  }
  async function logout() {
    setLogoutError(false);
    try {
      const response = await fetch("/api/v1/operator/logout", { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-TinyWarden-Request": "1" },
        body: JSON.stringify({ schema_version: 1 }) });
      if (!response.ok) throw new Error("logout_failed");
      expiredRef.current = true;
      requestID.current++;
      inFlight.current?.abort();
      setPage(null);
      pageRef.current = null;
      router.push("/login");
      router.refresh();
    } catch { setLogoutError(true); }
  }

  return (
    <main id="main" tabIndex={-1} className="mx-auto min-h-dvh max-w-[1600px] px-5 py-6 sm:px-[60px]">
      <header className="flex items-center justify-between border-b pb-5">
        <Link href="/" className="text-2xl font-semibold tracking-tight">{messages.home.brand}</Link>
        <button type="button" onClick={() => void logout()}
          className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
          {messages.fleet.logout}
        </button>
      </header>
      <section className="pt-12">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{messages.fleet.title}</h1>
            <p className="mt-3 text-lg text-muted-foreground">{messages.fleet.description}</p>
          </div>
          <button type="button" disabled={busy || expired} onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-base font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-none stroke-current stroke-2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7v5h-5M4 17v-5h5M5.6 9A7 7 0 0 1 18 7l2 5M4 12l2 5a7 7 0 0 0 12.4-2" />
            </svg>
            {busy ? messages.fleet.refreshing : messages.fleet.refresh}
          </button>
        </div>
        {expired ? <div role="alert" className="mt-8 rounded-md border p-5">
          <p>{messages.fleet.expired}</p>
          <Link href="/login" className="mt-2 inline-block font-medium text-primary underline">{messages.fleet.signIn}</Link>
        </div> : null}
        {!expired && failed ? <p role="alert" className="mt-8 rounded-md border border-amber-200 bg-amber-50 p-4">
          {page ? messages.fleet.outdated : messages.fleet.unavailable}
        </p> : null}
        {logoutError ? <p role="alert" className="mt-8 rounded-md border border-amber-200 bg-amber-50 p-4">
          {messages.fleet.logoutFailed}
        </p> : null}
        {!expired && !failed && page?.hosts.some((host) => host.contact_state === "stale")
          ? <div role="status" className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-4">
            <p>{messages.fleet.staleNotice}</p>
            <p className="text-sm text-muted-foreground">{messages.fleet.asOf} {date(page.as_of)}</p>
          </div> : null}
        {!expired && busy && !page ? <p role="status" className="mt-10">{messages.fleet.loading}</p> : null}
        {!expired && page && page.hosts.length === 0 ? <div className="mt-9 rounded-md border border-dashed px-6 py-20 text-center">
          <h2 className="text-xl font-semibold">{messages.fleet.emptyTitle}</h2>
          <p className="mt-2 text-muted-foreground">{messages.fleet.emptyDescription}</p>
        </div> : null}
        {!expired && page && page.hosts.length > 0 ? <>
          <ul aria-label={messages.fleet.hostsRegion} className="mt-9 divide-y rounded-md border sm:hidden">
            {page.hosts.map((host) => {
              const contact = contactLabel(host, page, tick, failed);
              return <li key={host.host_id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link href={"/fleet/" + host.host_id} aria-label={messages.fleet.details + ": " + host.label}
                    className="font-semibold text-primary underline-offset-4 hover:underline">{host.label}</Link>
                  <Badge variant="secondary" className={contactStyle(contact)}>
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{contact}
                  </Badge>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">{messages.fleet.lastContact}</dt>
                  <dd className="text-right">{date(host.last_contact_at)}</dd>
                  <dt className="text-muted-foreground">{messages.fleet.agentVersion}</dt>
                  <dd className="text-right">{host.agent_version}</dd>
                </dl>
              </li>;
            })}
          </ul>
          <div role="region" aria-label={messages.fleet.hostsRegion} tabIndex={0}
            className="mt-9 hidden overflow-x-auto rounded-md border bg-card sm:block">
            <table className="w-full min-w-[680px] border-collapse text-left text-base">
              <thead className="bg-muted/70 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-4 font-medium">{messages.fleet.host}</th>
                  <th scope="col" className="px-5 py-4 font-medium">{messages.fleet.contact}</th>
                  <th scope="col" className="px-5 py-4 font-medium">{messages.fleet.lastContact}</th>
                  <th scope="col" className="px-5 py-4 font-medium">{messages.fleet.agentVersion}</th>
                </tr>
              </thead>
              <tbody>
                {page.hosts.map((host) => {
                  const contact = contactLabel(host, page, tick, failed);
                  return <tr key={host.host_id} className="border-t">
                    <td className="px-5 py-4 font-medium">
                      <Link href={"/fleet/" + host.host_id} aria-label={messages.fleet.details + ": " + host.label}
                        className="text-primary underline-offset-4 hover:underline">{host.label}</Link>
                    </td>
                    <td className="px-5 py-4"><Badge variant="secondary" className={contactStyle(contact)}>
                      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{contact}
                    </Badge></td>
                    <td className="px-5 py-4">{date(host.last_contact_at)}</td>
                    <td className="px-5 py-4">{host.agent_version}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between gap-4 text-sm">
            <p className="text-muted-foreground">{messages.fleet.asOf} {date(page.as_of)}</p>
            {history.length || page.next_cursor ? <div className="flex gap-2">
              <button type="button" disabled={!history.length || busy} onClick={() => void previous()}
                className="rounded-md border px-3 py-2 font-medium disabled:opacity-40">{messages.fleet.previous}</button>
              <button type="button" disabled={!page.next_cursor || busy} onClick={() => void next()}
                className="rounded-md border px-3 py-2 font-medium disabled:opacity-40">{messages.fleet.next}</button>
            </div> : null}
          </div>
        </> : null}
        {!expired ? <CheckPolicyEditor /> : null}
        {!expired ? <BaselineEditors /> : null}
      </section>
    </main>
  );
}
