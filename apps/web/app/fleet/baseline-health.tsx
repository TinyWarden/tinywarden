"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { messages } from "@/i18n/messages";
import type { readBaselineHealth } from "@/server/checks/baseline-health";
import { baselineKeys } from "@/server/checks/baseline-types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BaselineEditors } from "./baseline-editor";
import { BaselineObservation, baselineDate, baselineReason } from "./baseline-observation";

type Health = Awaited<ReturnType<typeof readBaselineHealth>>;
const t = messages.baseline, v = t.view, d = messages.disk;
type Capture = { health: Health; received: number; duration: number };

export function BaselineHealth({ hostId }: { hostId: string }) {
  const [capture, setCapture] = useState<Capture | null>(null), [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false), [expired, setExpired] = useState(false), [tick, setTick] = useState(0);
  const inFlight = useRef<AbortController | null>(null), seq = useRef(0), permission = useRef(false);
  const load = useCallback(async () => {
    if (permission.current || inFlight.current) return;
    const controller = new AbortController(), order = ++seq.current, started = performance.now();
    const timer = window.setTimeout(() => controller.abort(), 15_000);
    inFlight.current = controller; setBusy(true);
    try {
      const r = await fetch(`/api/v1/operator/hosts/${hostId}/baselines`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (order !== seq.current || controller.signal.aborted) return;
      if (r.status === 401) { permission.current = true; setExpired(true); setCapture(null); return; }
      if (!r.ok) throw new Error("baseline_unavailable");
      const h: Health & { schema_version: number } = await r.json();
      if (h.schema_version !== 1 || h.host_id !== hostId || !Number.isFinite(Date.parse(h.as_of)) || h.checks.length !== 3 ||
        h.checks.some((c, i) => c.definition_key !== baselineKeys[i] || !["healthy", "warning", "unknown", "stale"].includes(c.state) ||
          !Array.isArray(c.history) || c.history.length > 5 || c.valid_until !== null && !Number.isFinite(Date.parse(c.valid_until)))) throw new Error("baseline_invalid");
      if (order !== seq.current || controller.signal.aborted || permission.current) return;
      const received = performance.now(); setCapture({ health: h, received, duration: received - started }); setTick(received); setFailed(false);
    } catch { if (order === seq.current && !permission.current) setFailed(true); }
    finally { window.clearTimeout(timer); if (inFlight.current === controller) inFlight.current = null; if (order === seq.current) setBusy(false); }
  }, [hostId]);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0), counter = seq;
    let lastPoll = performance.now();
    const timer = window.setInterval(() => { if (!document.hidden) {
      const now = performance.now(); setTick(now);
      if (now - lastPoll >= 30_000) { lastPoll = now; void load(); }
    } }, 1000);
    const visible = () => { if (!document.hidden) { setTick(performance.now()); void load(); } };
    document.addEventListener("visibilitychange", visible);
    return () => { counter.current++; inFlight.current?.abort(); window.clearTimeout(initial); window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [load]);
  return <>
    <section aria-labelledby="baseline-health-heading" className="mt-10 flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4"><h2 id="baseline-health-heading" className="text-2xl font-semibold">{t.title}</h2>
        <Button type="button" variant="outline" disabled={busy || expired} onClick={() => void load()}>{busy ? v.refreshing : v.refresh}</Button></div>
      {expired && <p role="alert">{messages.checks.sessionLost} <Link href="/login" className="underline">{messages.fleet.signIn}</Link></p>}
      {failed && <p role="alert">{capture ? v.outdated : v.readFailure}</p>}
      {!capture && !failed && !expired && <p role="status">{t.editing.loading}</p>}
      {capture?.health.checks.map((check) => {
        const elapsed = tick - capture.received + capture.duration;
        const timedOut = check.valid_until !== null && elapsed >= Date.parse(check.valid_until) - Date.parse(capture.health.as_of);
        const outdated = failed || timedOut;
        const state = outdated ? "unknown" : check.state;
        return <Card key={check.definition_key} className="min-w-0">
          <CardHeader><CardTitle><h3>{t.names[check.definition_key]}</h3></CardTitle><CardDescription>{t.scope[check.definition_key]}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div><Badge variant="outline">{d[state]}</Badge><p className="mt-2 text-sm">{outdated ? v.outdated : baselineReason(check.reason)}</p></div>
            {(outdated || state === "unknown" || state === "stale") && check.latest?.assessment.state === "warning" &&
              <p className="text-sm">{v.historicalAttention} {baselineReason(check.latest.assessment.reason)}</p>}
            <h4 className="font-medium">{v.history}</h4>
            {check.history.length ? check.history.map((run) => <details key={run.run_id} className="min-w-0 rounded-md border p-4">
              <summary className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring">{baselineDate(run.received_at)}{d.itemSeparator}{d.sequence} {run.sequence}{d.itemSeparator}{d[run.assessment.state]}</summary>
              <div className="mt-4"><BaselineObservation run={run} /></div>
            </details>) : <p className="text-sm text-muted-foreground">{v.empty}</p>}
          </CardContent>
          <CardFooter><p className="text-sm text-muted-foreground">{messages.fleet.asOf} {baselineDate(capture.health.as_of)}</p></CardFooter>
        </Card>;
      })}
    </section>
    {!expired && <BaselineEditors hostId={hostId} />}
  </>;
}
