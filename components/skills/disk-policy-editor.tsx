"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { SkillEditorProps } from "@/lib/skills/types";
import { text } from "@/components/operator/format";
import { messages } from "@/i18n/messages";

const t = messages.skills;

type Values = { warning_percent: number; critical_percent: number; interval_seconds: number };
type Global = { schema_version: 1; revision: number; warning_percent: number;
  critical_percent: number; interval_seconds: number };
type Host = { schema_version: 1; current_default_revision: number; default_values: Values;
  policy_version: number; mode: "inherit" | "override"; override_values: Values | null;
  effective_values: Values; applicability: string; latest_delivered_revision: number | null;
  latest_delivered_values: Values | null };
type Baseline = Global | Host;
type Draft = { mode: "inherit" | "override"; warning: string; critical: string; interval: string };
type Status = "loading" | "ready" | "unavailable" | "saving" | "uncertain" |
  "conflict" | "conflictUnavailable" | "saved" | "noChange" |
  "refreshFailed" | "permission" | "error";

function isHost(value: Baseline): value is Host { return "policy_version" in value; }
function validBaseline(value: unknown, host: boolean): value is Baseline {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (row.schema_version !== 1) return false;
  if (host) return Number.isSafeInteger(row.policy_version) &&
    Number.isSafeInteger(row.current_default_revision) &&
    (row.mode === "inherit" || row.mode === "override") &&
    !!row.default_values && !!row.effective_values;
  return Number.isSafeInteger(row.revision) &&
    typeof row.warning_percent === "number" && typeof row.critical_percent === "number" &&
    typeof row.interval_seconds === "number";
}
function fromBaseline(value: Baseline): Draft {
  const mode = isHost(value) ? value.mode : "override";
  const settings = isHost(value) ? value.override_values ?? value.effective_values : value;
  return { mode, warning: String(settings.warning_percent),
    critical: String(settings.critical_percent), interval: String(settings.interval_seconds) };
}
function dirty(value: Draft, baseline: Baseline): boolean {
  const saved = fromBaseline(baseline);
  if (value.mode !== saved.mode) return true;
  if (value.mode === "inherit") return false;
  return value.warning !== saved.warning || value.critical !== saved.critical ||
    value.interval !== saved.interval;
}
function numbers(draft: Draft): Values | null {
  const warning = Number(draft.warning), critical = Number(draft.critical), interval = Number(draft.interval);
  if (![draft.warning, draft.critical, draft.interval].every((x) => /^(0|[1-9][0-9]*)$/.test(x)) ||
      !Number.isInteger(warning) || warning < 1 || warning > 99 ||
      !Number.isInteger(critical) || critical <= warning || critical > 100 ||
      !Number.isInteger(interval) || interval < 60 || interval > 3600) return null;
  return { warning_percent: warning, critical_percent: critical, interval_seconds: interval };
}
function formatValues(value: Values): string {
  return messages.checks.valuesFormat.replace("{warning}", String(value.warning_percent))
    .replace("{critical}", String(value.critical_percent))
    .replace("{interval}", String(value.interval_seconds));
}

export function CheckPolicyEditor({ hostId, presentation, onDraftChange, onSaved }: { hostId?: string } & SkillEditorProps) {
  const m = messages.checks;
  const path = hostId ? `/api/v1/operator/hosts/${hostId}/checks/disk-local`
    : "/api/v1/operator/check-definitions/disk-local";
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [defaultConflict, setDefaultConflict] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const baselineRef = useRef<Baseline | null>(null);
  const dirtyRef = useRef(false);
  const pendingRef = useRef<{ id: string; body: string } | null>(null);
  const loadSeq = useRef(0);

  const load = useCallback(async (): Promise<boolean> => {
    const seq = ++loadSeq.current;
    try {
      const response = await fetch(path, { credentials: "same-origin", cache: "no-store" });
      if (seq !== loadSeq.current) return false;
      if (response.status === 401) { document.dispatchEvent(new Event("tinywarden:permission-lost")); setStatus("permission"); return false; }
      if (!response.ok) return false;
      const value: unknown = await response.json();
      if (seq !== loadSeq.current || !validBaseline(value, !!hostId)) return false;
      const next = value as Baseline;
      baselineRef.current = next;
      setBaseline(next);
      if (!dirtyRef.current) setDraft(fromBaseline(next));
      return true;
    } catch { return false; }
  }, [hostId, path]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void load().then((ok) => { if (active) setStatus((current) =>
        current === "permission" ? current : ok ? "ready" : "unavailable"); });
    }, 0);
    const sequence = loadSeq;
    return () => { active = false; window.clearTimeout(timer); sequence.current++; };
  }, [load]);

  useEffect(() => {
    if (presentation === "skill") return;
    const before = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) { event.preventDefault(); event.returnValue = ""; }
    };
    const click = (event: MouseEvent) => {
      const target = event.target;
      const anchor = target instanceof Element ? target.closest("a[href]") : null;
      if (anchor && dirtyRef.current && !window.confirm(m.discardConfirm)) event.preventDefault();
    };
    const leave = (event: Event) => { if (dirtyRef.current && !window.confirm(m.discardConfirm)) event.preventDefault(); };
    document.addEventListener("tinywarden:before-leave", leave);
    window.addEventListener("beforeunload", before);
    document.addEventListener("click", click, true);
    return () => { document.removeEventListener("tinywarden:before-leave", leave); window.removeEventListener("beforeunload", before);
      document.removeEventListener("click", click, true); };
  }, [m.discardConfirm, presentation]);

  function edit(change: Partial<Draft>) {
    if (!draft || !baselineRef.current || status === "uncertain" || status === "saving") return;
    const next = { ...draft, ...change };
    dirtyRef.current = dirty(next, baselineRef.current);
    pendingRef.current = null;
    setDraft(next);
    setInvalid(false);
    if (status !== "conflict") setStatus("ready");
  }
  function discard() {
    if (!baselineRef.current || (dirtyRef.current && !window.confirm(m.discardConfirm))) return;
    dirtyRef.current = false;
    pendingRef.current = null;
    setDraft(fromBaseline(baselineRef.current));
    setInvalid(false);
    setStatus("ready");
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = baselineRef.current;
    if (!saved || !draft || status === "saving" || status === "conflict") return;
    const tuple = draft.mode === "override" ? numbers(draft) : null;
    if (draft.mode === "override" && !tuple) { setInvalid(true); return; }
    const payload = isHost(saved) ? { schema_version: 1, request_id: "", expected_policy_version: saved.policy_version,
      expected_default_revision: saved.current_default_revision, mode: draft.mode,
      ...(tuple ?? {}) } : { schema_version: 1, request_id: "", expected_revision: saved.revision,
        ...tuple };
    const unsigned = JSON.stringify(payload);
    const prior = pendingRef.current;
    const requestId = prior && prior.body === unsigned ? prior.id : crypto.randomUUID();
    pendingRef.current = { id: requestId, body: unsigned };
    setDefaultConflict(false); setStatus("saving");
    try {
      const response = await fetch(path, { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json", "X-TinyWarden-Request": "1" },
        body: JSON.stringify({ ...payload, request_id: requestId }) });
      if (response.status === 401) { document.dispatchEvent(new Event("tinywarden:permission-lost")); setStatus("permission"); return; }
      if (response.status === 409) {
        const error = await response.json().catch(() => null);
        if (error?.error?.code === "default_override_conflict") { pendingRef.current = null; setDefaultConflict(true); setStatus("ready"); return; }
        pendingRef.current = null;
        setStatus(await load() ? "conflict" : "conflictUnavailable");
        return;
      }
      if (!response.ok) { setStatus(response.status >= 500 ? "uncertain" : "error"); return; }
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" ||
          typeof (result as Record<string, unknown>).changed !== "boolean") {
        setStatus("uncertain"); return;
      }
      pendingRef.current = null;
      dirtyRef.current = false;
      const changed = (result as { changed: boolean }).changed;
      if (await load()) { onSaved?.(); setStatus(changed ? "saved" : "noChange"); }
      else setStatus("refreshFailed");
    } catch { setStatus("uncertain"); }
  }

  const blocked = status === "permission" || status === "saving" ||
    status === "uncertain" || status === "refreshFailed" || status === "conflictUnavailable";
  const host = baseline && isHost(baseline) ? baseline : null;
  const current = host?.effective_values ?? (baseline ? baseline as Global : null);
  const isDirty = baseline && draft ? dirty(draft, baseline) : false;
  useEffect(() => { onDraftChange?.({ key: "disk-local", dirty: !!isDirty || !!pendingRef.current, interval: draft?.interval ?? "" }); }, [isDirty, draft?.interval, status, onDraftChange]);
  return <section data-skill-editor={presentation} data-dirty={!!isDirty} aria-labelledby={hostId ? "host-check-heading" : "global-check-heading"}
    className="mt-10 min-w-0 rounded-lg border bg-card p-5 sm:p-7">
    <h2 id={hostId ? "host-check-heading" : "global-check-heading"} className="text-xl font-semibold">
      {presentation === "skill" ? t.thresholds : hostId ? m.hostTitle : m.globalTitle}</h2>
    <p className="mt-2 text-sm text-muted-foreground">{presentation === "skill" ? t.applyNote : m.coverage}</p>
    {status === "loading" && !baseline ? <p role="status" className="mt-5">{m.loading}</p> : null}
    {status === "unavailable" && !baseline ? <div role="alert" className="mt-5"><p>{m.unavailable}</p>
      <button type="button" onClick={() => void load().then((ok) => setStatus(ok ? "ready" : "unavailable"))}
        className="mt-2 underline">{m.retry}</button></div> : null}
    {status === "permission" ? <p role="alert" className="mt-5">{m.sessionLost} <Link href="/login" className="underline">{messages.fleet.signIn}</Link></p> : null}
    {baseline && draft ? <>
      <p className={presentation === "skill" ? "tw-skill-inline-revision" : "mt-5 text-sm"}>{host ? m.policyVersion : m.savedRevision} <strong>
        {host ? host.policy_version : (baseline as Global).revision}</strong></p>
      {host ? <p className="mt-1 text-sm">{m.defaultRevision} <strong>{host.current_default_revision}</strong></p> : null}
      <form onSubmit={(event) => void save(event)} className="mt-5 space-y-5">
        <fieldset disabled={blocked} className="space-y-4 disabled:opacity-60">
          {host ? <div className="space-y-2"><label className="flex items-start gap-2">
            <input type="radio" name={`mode-${hostId}`} checked={draft.mode === "inherit"}
              onChange={() => edit({ mode: "inherit" })} className="mt-1" />{m.inherit}</label>
            <label className="flex items-start gap-2"><input type="radio" name={`mode-${hostId}`}
              checked={draft.mode === "override"} onChange={() => edit({ mode: "override",
                warning: String(current?.warning_percent ?? 85), critical: String(current?.critical_percent ?? 95),
                interval: String(current?.interval_seconds ?? 300) })} className="mt-1" />{m.override}</label></div> : null}
          {draft.mode === "override" ? <div className="grid min-w-0 gap-4 sm:grid-cols-3">
            {([ ["warning", presentation === "skill" ? t.warning : m.warning], ["critical", presentation === "skill" ? t.critical : m.critical], ["interval", presentation === "skill" ? t.interval : m.interval] ] as const)
              .map(([field, label]) => <label key={field} className="block min-w-0 text-sm font-medium">
                {label}{presentation === "skill" && baseline && draft[field] !== fromBaseline(baseline)[field] ? <span className="tw-skill-was tw-meta">{text(t.changedWas, { value: fromBaseline(baseline)[field] })}</span> : null}<span className={presentation === "skill" ? "tw-skill-number" : undefined}><input type="number" inputMode="numeric" min={field === "interval" ? 60 : 1}
                  max={field === "interval" ? 3600 : 100} step="1" value={draft[field]}
                  aria-invalid={invalid} aria-describedby={invalid ? "check-policy-error" : undefined}
                  onChange={(event) => edit({ [field]: event.target.value })}
                  className="mt-2 w-full rounded-md border bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-ring" />{presentation === "skill" ? <span>{field === "interval" ? t.seconds : t.percent}</span> : null}</span>
              </label>)}</div> : <p className="text-sm">{m.effective} {formatValues(current!)}</p>}
        </fieldset>
        {defaultConflict ? <p role="alert" className="text-sm text-destructive">{m.defaultOverrideConflict}</p> : null}
    {invalid ? <p id="check-policy-error" role="alert" className="text-sm text-destructive">{m.invalid}</p> : null}
        <div className={presentation === "skill" ? "tw-skill-savebar" : "flex flex-wrap gap-3"}><button type="submit" disabled={!isDirty || status === "permission" || status === "saving" || status === "conflict" || status === "conflictUnavailable" || status === "refreshFailed"}
          className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50">
          {status === "saving" ? m.saving : status === "uncertain" ? m.retry : presentation === "skill" ? text(t.save, { name: t.names["disk-local"] }) : m.save}</button>
          <button type="button" onClick={discard} disabled={blocked || !isDirty}
            className="rounded-md border px-4 py-2 disabled:opacity-50">{m.discard}</button></div>
      </form>
      {host ? <div className="mt-6 border-t pt-4 text-sm">
        <p>{m.effective} {formatValues(host.effective_values)}</p>
        <p className="mt-2">{m.delivered} {host.latest_delivered_revision ?? m.notDelivered}</p>
        {host.latest_delivered_values ? <p className="mt-2">{m.deliveredValues} {
          formatValues(host.latest_delivered_values)}</p> : null}
        <p className="mt-2">{m[host.applicability as keyof typeof m] ?? m.unknown}</p>
        <p className="mt-2 text-muted-foreground">{m.deliveryPending}</p>
      </div> : null}
    </> : null}
    {status === "conflict" ? <div role="alert" className="mt-5 rounded-md border border-amber-300 p-3">
      <p>{m.conflict}</p><button type="button" onClick={() => setStatus("ready")}
        className="mt-2 underline">{m.review}</button></div> : null}
    {status === "conflictUnavailable" ? <div role="alert" className="mt-5 rounded-md border border-amber-300 p-3">
      <p>{m.conflictUnavailable}</p><button type="button"
        onClick={() => void load().then((ok) => setStatus(ok ? "conflict" : "conflictUnavailable"))}
        className="mt-2 underline">{m.retry}</button></div> : null}
    {(["saved", "noChange", "uncertain", "refreshFailed", "error"] as Status[]).includes(status)
      ? <p role="status" className="mt-5 text-sm">{status === "saved" ? m.saved :
        status === "noChange" ? m.noChange : status === "uncertain" ? m.saveUnknown :
          status === "refreshFailed" ? m.refreshFailed : m.error}</p> : null}
    {status === "refreshFailed" ? <button type="button" onClick={() => void load().then((ok) => setStatus(ok ? "ready" : "refreshFailed"))}
      className="mt-3 underline">{m.retry}</button> : null}
  </section>;
}
