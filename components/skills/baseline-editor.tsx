"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { SkillEditorProps } from "@/lib/skills/types";
import { text } from "@/components/operator/format";
import { messages } from "@/i18n/messages";
import { type BaselineKey } from "@/lib/skills/catalog";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Field, FieldGroup, FieldSet, FieldLegend, FieldLabel, FieldTitle, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { baselineDraft, baselineDirty, baselineDraftValues, baselineValuesLabel, isHostBaseline, validSavedBaseline,
  type SavedBaseline, type BaselineDraft } from "./baseline-editor-model";

const skills = messages.skills;

type Status = "loading" | "ready" | "saving" | "uncertain" | "permission" | "unavailable" |
  "conflict" | "conflictUnavailable" | "saved" | "noChange" | "refreshFailed" | "error";
const t = messages.baseline, e = t.editing, m = { ...messages.checks, ...e };

export function BaselineEditor({ definitionKey: key, hostId, presentation, onDraftChange, onSaved }: { definitionKey: BaselineKey; hostId?: string } & SkillEditorProps) {
  const path = hostId ? `/api/v1/operator/hosts/${hostId}/baselines/${key}` : `/api/v1/operator/baseline-definitions/${key}`;
  const id = `baseline-${hostId ?? "global"}-${key}`;
  const [saved, setSaved] = useState<SavedBaseline | null>(null), [draft, setDraft] = useState<BaselineDraft | null>(null);
  const [status, setStatus] = useState<Status>("loading"), [invalid, setInvalid] = useState(false);
  const baseline = useRef<SavedBaseline | null>(null), dirty = useRef(false);
  const pending = useRef<{ id: string; body: string } | null>(null), seq = useRef(0), busy = useRef(false);
  const permission = useRef(false);

  const load = useCallback(async () => {
    const order = ++seq.current;
    const controller = new AbortController(), timer = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const r = await fetch(path, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (order !== seq.current || controller.signal.aborted) return false;
      if (r.status === 401) { document.dispatchEvent(new Event("tinywarden:permission-lost")); permission.current = true; setStatus("permission"); return false; }
      if (!r.ok) return false;
      const v: unknown = await r.json();
      if (order !== seq.current || controller.signal.aborted || permission.current || !validSavedBaseline(v, key, !!hostId)) return false;
      baseline.current = v; setSaved(v);
      if (!dirty.current) setDraft(baselineDraft(v));
      return true;
    } catch { return false; }
    finally { window.clearTimeout(timer); }
  }, [path, key, hostId]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => void load().then((ok) => { if (active && !permission.current) setStatus(ok ? "ready" : "unavailable"); }), 0);
    const order = seq;
    return () => { active = false; order.current++; window.clearTimeout(timer); };
  }, [load]);
  useEffect(() => {
    if (presentation === "skill") return;
    const before = (v: BeforeUnloadEvent) => { if (dirty.current || pending.current) { v.preventDefault(); v.returnValue = ""; } };
    const click = (v: MouseEvent) => {
      if (v.defaultPrevented) return;
      if (v.target instanceof Element && v.target.closest("a[href]") && (dirty.current || pending.current) && !window.confirm(m.discardConfirm)) v.preventDefault();
    };
    const leave = (v: Event) => { if ((dirty.current || pending.current) && !window.confirm(m.discardConfirm)) v.preventDefault(); };
    document.addEventListener("tinywarden:before-leave", leave);
    window.addEventListener("beforeunload", before); document.addEventListener("click", click, true);
    return () => { document.removeEventListener("tinywarden:before-leave", leave); window.removeEventListener("beforeunload", before); document.removeEventListener("click", click, true); };
  }, [presentation]);
  const blocked = ["loading", "saving", "uncertain", "permission", "refreshFailed", "conflictUnavailable"].includes(status);
  function edit(change: Partial<BaselineDraft>) {
    if (!draft || !baseline.current || blocked || busy.current) return;
    const next = { ...draft, ...change }; dirty.current = baselineDirty(next, baseline.current);
    pending.current = null; setDraft(next); setInvalid(false);
    if (status !== "conflict") setStatus("ready");
  }
  function discard() {
    if (blocked || !baseline.current || !window.confirm(m.discardConfirm)) return;
    dirty.current = false; pending.current = null; setDraft(baselineDraft(baseline.current)); setInvalid(false); setStatus("ready");
  }
  async function refresh() {
    if (busy.current || permission.current || status === "uncertain") return;
    busy.current = true; setStatus("loading");
    try { setStatus(await load() ? (status === "conflictUnavailable" || status === "conflict" ? "conflict" : "ready") : permission.current ? "permission" : "unavailable"); }
    finally { busy.current = false; }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const base = baseline.current;
    if (!base || !draft || busy.current || permission.current || ["conflict", "conflictUnavailable", "refreshFailed"].includes(status)) return;
    const values = draft.mode === "override" ? baselineDraftValues(draft, key) : null;
    if (draft.mode === "override" && !values) { setInvalid(true); return; }
    const unsigned = isHostBaseline(base) ? { schema_version: 1, expected_policy_version: base.policy_version,
      expected_default_revision: base.current_default_revision, mode: draft.mode, ...(values ?? {}) }
      : { schema_version: 1, expected_revision: base.revision, ...values };
    const body = JSON.stringify(unsigned);
    if (pending.current && pending.current.body !== body) return;
    const request = pending.current ?? { id: crypto.randomUUID(), body }; pending.current = request;
    busy.current = true; setStatus("saving");
    const controller = new AbortController(), timer = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const r = await fetch(path, { method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json", "X-TinyWarden-Request": "1" }, body: JSON.stringify({ ...unsigned, request_id: request.id }) });
      if (r.status === 401) { document.dispatchEvent(new Event("tinywarden:permission-lost")); permission.current = true; setStatus("permission"); return; }
      if (r.status === 409) { pending.current = null; setStatus(await load() ? "conflict" : permission.current ? "permission" : "conflictUnavailable"); return; }
      if (!r.ok) { if (r.status < 500) pending.current = null; setStatus(r.status >= 500 ? "uncertain" : "error"); return; }
      const v: unknown = await r.json();
      if (controller.signal.aborted || !v || typeof v !== "object" || (v as {schema_version: unknown}).schema_version !== 1 ||
        typeof (v as {changed: unknown}).changed !== "boolean") { setStatus("uncertain"); return; }
      pending.current = null; dirty.current = false;
      if (await load()) { onSaved?.(); setStatus((v as {changed: boolean}).changed ? "saved" : "noChange"); }
      else setStatus(permission.current ? "permission" : "refreshFailed");
    } catch { if (!permission.current) setStatus("uncertain"); }
    finally { busy.current = false; window.clearTimeout(timer); }
  }
  const host = saved && isHostBaseline(saved) ? saved : null;
  const effective = host?.effective_values ?? (saved && !isHostBaseline(saved) ? saved : null);
  const feedback: Partial<Record<Status, string>> = { loading: m.loading, unavailable: saved ? e.savedReadFailure : m.unavailable,
    permission: m.sessionLost, conflict: m.conflict, conflictUnavailable: m.conflictUnavailable, saved: m.saved, noChange: m.noChange,
    uncertain: m.saveUnknown, refreshFailed: m.refreshFailed, error: m.error };
  const isDirty = !!saved && !!draft && baselineDirty(draft, saved);
  useEffect(() => { onDraftChange?.({ key, dirty: isDirty || !!pending.current, interval: draft?.interval ?? "" }); }, [key, isDirty, draft?.interval, status, onDraftChange]);
  return <Card data-skill-editor={presentation} data-dirty={isDirty} className="min-w-0" aria-labelledby={`${id}-heading`}>
    <CardHeader><CardTitle><h3 id={`${id}-heading`}>{t.names[key]}</h3></CardTitle><CardDescription>{t.scope[key]}</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-5">
      {feedback[status] && <p role={status === "saved" || status === "noChange" || status === "loading" ? "status" : "alert"}>{feedback[status]}</p>}
      {status === "permission" && <Link href="/login" className="underline">{messages.fleet.signIn}</Link>}
      {saved && draft && <>
        <p className={presentation === "skill" ? "tw-skill-inline-revision" : undefined}>{host ? m.policyVersion : m.savedRevision}
          {host ? host.policy_version : !isHostBaseline(saved) ? saved.revision : null}</p>
        {host && <p>{m.defaultRevision} {host.current_default_revision}{messages.disk.itemSeparator}{e.pinned} {host.pinned_definition_revision ?? m.inherit}</p>}
        {host && <p>{e.savedDefault}{messages.disk.fieldSeparator}{baselineValuesLabel(host.default_values)}</p>}
        <form id={`${id}-form`} onSubmit={(event) => void save(event)} noValidate>
          <FieldSet disabled={blocked}><FieldLegend>{presentation === "skill" ? skills.timing : e.timing}</FieldLegend><FieldGroup>
            {host && <Field data-disabled={blocked}><FieldTitle id={`${id}-mode`}>{e.mode}</FieldTitle>
              <ToggleGroup type="single" variant="outline" value={draft.mode} disabled={blocked} aria-labelledby={`${id}-mode`} className="flex-wrap"
                onValueChange={(mode) => { if (mode === "inherit" || mode === "override") edit(mode === "override" && effective ?
                  { mode, interval: String(effective.interval_seconds), timeout: String(effective.timeout_seconds), packageMode: effective.package_mode } : { mode }); }}>
                <ToggleGroupItem value="inherit">{m.inherit}</ToggleGroupItem><ToggleGroupItem value="override">{m.override}</ToggleGroupItem>
              </ToggleGroup>{presentation === "skill" ? <p className="text-sm text-muted-foreground">{skills.modeNote}</p> : null}</Field>}
            {draft.mode === "override" ? <>
              {([["interval", presentation === "skill" ? skills.interval : e.interval, 300, 86400], ["timeout", presentation === "skill" ? skills.timeout : e.timeout, 1, 30]] as const).map(([field, label, min, max]) =>
                <Field key={field} data-invalid={invalid} data-disabled={blocked}><FieldLabel htmlFor={`${id}-${field}`}>{label}{presentation === "skill" && saved && draft[field] !== baselineDraft(saved)[field] ? <span className="tw-skill-was tw-meta">{text(skills.changedWas, { value: baselineDraft(saved)[field] })}</span> : null}</FieldLabel>
                  <span className={presentation === "skill" ? "tw-skill-number" : undefined}><Input id={`${id}-${field}`} type="number" inputMode="numeric" min={min} max={max} step="1" value={draft[field]}
                    aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined} onChange={(v) => edit({ [field]: v.target.value })} />{presentation === "skill" ? <span>{skills.seconds}</span> : null}</span></Field>)}
              {key === "package-updates" && <Field><FieldTitle id={`${id}-apt-mode`}>{presentation === "skill" ? skills.simulation : e.packageMode}</FieldTitle>
                <ToggleGroup type="single" variant="outline" value={draft.packageMode} disabled={blocked} aria-labelledby={`${id}-apt-mode`} className="flex-wrap"
                  onValueChange={(packageMode) => { if (packageMode === "upgrade" || packageMode === "with-new-pkgs") edit({ packageMode }); }}>
                  <ToggleGroupItem value="upgrade">{presentation === "skill" ? skills.existing : e.upgrade}</ToggleGroupItem><ToggleGroupItem value="with-new-pkgs">{presentation === "skill" ? skills.dependencies : e["with-new-pkgs"]}</ToggleGroupItem>
                </ToggleGroup>{presentation === "skill" ? <p className="text-sm text-muted-foreground">{skills.modeNote}</p> : null}</Field>}
            </> : effective && <p>{m.effective} {baselineValuesLabel(effective)}</p>}
          </FieldGroup></FieldSet>
          {invalid && <FieldError id={`${id}-error`}>{e.invalid}</FieldError>}
        </form>
        {host && <div className="flex flex-col gap-2 text-sm"><p>{m.effective} {baselineValuesLabel(host.effective_values)}</p>
          <p>{m.delivered} {host.latest_delivered_revision ?? m.notDelivered}</p>
          {host.latest_delivered_values && <p>{m.deliveredValues} {baselineValuesLabel(host.latest_delivered_values)}</p>}
          <p>{(m as Record<string, string>)[host.applicability] ?? m.unknown}</p><p>{m.deliveryPending}</p></div>}
      </>}
    </CardContent>
    <CardFooter className={presentation === "skill" ? "tw-skill-savebar" : "flex-wrap gap-3"}>
      {saved && draft && <><Button type="submit" form={`${id}-form`} disabled={!baselineDirty(draft, saved) || blocked && status !== "uncertain" || status === "conflict"}>
        {status === "saving" ? m.saving : status === "uncertain" ? m.retry : presentation === "skill" ? text(skills.save, { name: skills.names[key] }) : m.save}</Button>
        <Button type="button" variant="outline" disabled={blocked || !baselineDirty(draft, saved)} onClick={discard}>{m.discard}</Button></>}
      <Button type="button" variant="outline" disabled={status === "saving" || status === "uncertain" || status === "permission"} onClick={() => void refresh()}>{e.refresh}</Button>
      {status === "conflict" && <Button type="button" variant="outline" onClick={() => setStatus("ready")}>{m.review}</Button>}
    </CardFooter>
  </Card>;
}
