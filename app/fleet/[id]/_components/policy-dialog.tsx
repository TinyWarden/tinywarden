"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { messages } from "@/i18n/messages";
import { text } from "@/components/operator/format";
import { permissionEvent } from "@/components/operator/use-operator-read";
import { fields, draftOf, draftDirty, draftOverrides, validPolicy, policyPath, type Field, type Policy } from "./policy-model";
const t = messages.server;

export function PolicyDialog({ initial, hostLabel, close, saved }: { initial: Policy; hostLabel: string; close: () => void; saved: () => void }) {
  const [policy, setPolicy] = useState(initial), [draft, setDraft] = useState(() => draftOf(initial));
  const [released, setReleased] = useState<Set<Field>>(() => new Set());
  const [custom, setCustom] = useState(initial.mode === "override"), [status, setStatus] = useState("ready");
  const dialog = useRef<HTMLDialogElement>(null), guard = useRef(false), controller = useRef<AbortController | null>(null);
  const pending = useRef<string | null>(null), alive = useRef(true);
  const dirty = draftDirty(draft, policy), busy = status === "saving", uncertain = status === "uncertain";
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; guard.current = dirty || busy || uncertain; }, [close,dirty,busy,uncertain]);
  const requestClose = () => { if (!guard.current || window.confirm(messages.checks.discardConfirm)) closeRef.current(); };
  useEffect(() => {
    const element = dialog.current!; element.showModal();
    const before = (event: BeforeUnloadEvent) => { if (guard.current) { event.preventDefault(); event.returnValue = ""; } };
    const permission = () => { pending.current = null; controller.current?.abort(); closeRef.current(); };
    window.addEventListener("beforeunload", before); document.addEventListener(permissionEvent, permission);
    return () => { alive.current = false; controller.current?.abort(); element.close(); window.removeEventListener("beforeunload", before); document.removeEventListener(permissionEvent, permission); };
  }, []);
  const change = (field: Field, value: string) => {
    if (busy || uncertain) return;
    setStatus("ready"); setDraft((old) => {
      const next = { ...old, [field]: value };
      if ((!Object.hasOwn(policy.overrides, field) || released.has(field)) && value === String(policy.default_values[field])) delete next[field];
      return next;
    });
  };
  const reset = (field?: Field) => { if (busy || uncertain) return; setStatus("ready"); setReleased((old) => new Set([...old, ...(field ? [field] : fields(policy.definition_key))])); setDraft((old) => {
    if (!field) return {}; const next = { ...old }; delete next[field]; return next;
  }); };
  async function reload() {
    if (dirty && !window.confirm(messages.checks.discardConfirm)) return;
    const c = new AbortController(); controller.current = c; setStatus("saving"); const timeout = window.setTimeout(() => c.abort(), 15000);
    try {
      const r = await fetch(policyPath(policy.host_id, policy.definition_key), { cache: "no-store", credentials: "same-origin", signal: c.signal });
      if (r.status === 401) { document.dispatchEvent(new Event(permissionEvent)); return; }
      const v: unknown = await r.json(); if (!r.ok || !validPolicy(v) || v.host_id !== policy.host_id || v.definition_key !== policy.definition_key) throw new Error("invalid_policy");
      if (alive.current) { setPolicy(v); setReleased(new Set()); setDraft(draftOf(v)); setCustom(v.mode === "override"); setStatus("ready"); }
    } catch { if (alive.current) setStatus("loadFailed"); }
    finally { window.clearTimeout(timeout); if (controller.current === c) controller.current = null; }
  }
  async function save() {
    const overrides = draftOverrides(draft, policy);
    if (!pending.current && !overrides) { setStatus("invalid"); return; }
    if (!pending.current) pending.current = JSON.stringify({ schema_version: 2, request_id: crypto.randomUUID(),
      expected_policy_version: policy.policy_version, expected_default_revision: policy.current_default_revision, overrides });
    const c = new AbortController(); controller.current = c; setStatus("saving"); const timeout = window.setTimeout(() => c.abort(), 15000);
    try {
      const r = await fetch(policyPath(policy.host_id, policy.definition_key), { method: "POST", credentials: "same-origin", cache: "no-store", signal: c.signal,
        headers: { "Content-Type": "application/json", "X-TinyWarden-Request": "1" }, body: pending.current });
      if (!alive.current) return;
      if (r.status === 401) { document.dispatchEvent(new Event(permissionEvent)); return; }
      if (r.status === 409) { const v = await r.json(); pending.current = null; setStatus(v.error?.code === "client_outdated" ? "clientOutdated" : "conflict"); return; }
      if (!r.ok) { if (r.status >= 500) throw new Error("save_uncertain"); pending.current = null; setStatus(r.status === 400 ? "invalid" : "error"); return; }
      const v = await r.json(); if (v.schema_version !== 2 || typeof v.changed !== "boolean" || !Number.isSafeInteger(v.policy_version)) throw new Error("save_uncertain");
      if (!alive.current) return;
      pending.current = null; guard.current = false; saved(); closeRef.current();
    } catch { if (alive.current) setStatus("uncertain"); }
    finally { window.clearTimeout(timeout); if (controller.current === c) controller.current = null; }
  }
  const key = policy.definition_key, name = messages.skills.names[key], effective = { ...policy.default_values, ...draft };
  return <dialog ref={dialog} className="tw-policy-dialog" aria-labelledby="server-settings-title"
    onCancel={(event) => { event.preventDefault(); requestClose(); }} onClick={(event) => { if (event.target === event.currentTarget && !busy && !uncertain) requestClose(); }}>
    <header><div><span className="tw-meta">{text(t.modalMeta, { skill: name, host: hostLabel, revision: policy.current_default_revision })}</span>
      <h2 id="server-settings-title">{text(t.modalTitle, { skill: name })}</h2></div>
      <button type="button" aria-label={t.closeSettings} disabled={busy || uncertain} onClick={requestClose}>{t.closeMark}</button></header>
    <div className="tw-policy-body">
      <div className="tw-policy-modes" role="group" aria-label={t.source}>
        <button type="button" aria-pressed={!custom} disabled={busy || uncertain} onClick={() => { reset(); setCustom(false); }}>{t.useGlobal}</button>
        <button type="button" aria-pressed={custom} disabled={busy || uncertain} onClick={() => setCustom(true)}>{t.useCustom}</button>
      </div><p>{custom ? t.customNote : t.inheritNote}</p>
      <div className="tw-policy-fields">{fields(key).map((field) => {
        const customized = Object.hasOwn(draft, field), value = String(effective[field]), id = `server-field-${field}`;
        return <div key={field} className="tw-policy-field" data-custom={customized}>
          <div><label htmlFor={id}>{t.labelFields[field]}</label>{customized ? <span className="tw-meta">{t.custom}</span> : null}</div>
          {field === "package_mode" ? <select id={id} value={value} disabled={!custom || busy || uncertain} onChange={(e) => change(field, e.target.value)}>
            <option value="upgrade">{messages.baseline.editing.upgrade}</option><option value="with-new-pkgs">{messages.baseline.editing["with-new-pkgs"]}</option>
          </select> : <div className="tw-policy-input"><input id={id} type="number" value={value} disabled={!custom || busy || uncertain}
            min={field === "interval_seconds" ? key === "disk-local" ? 60 : 300 : 1}
            max={field === "interval_seconds" ? key === "disk-local" ? 3600 : 86400 : field === "timeout_seconds" ? 30 : 100}
            aria-invalid={status === "invalid"} onChange={(e) => change(field, e.target.value)} />
            <span>{field.endsWith("percent") ? t.percentUsed : t.seconds}</span></div>}
          <div className="tw-policy-default"><span>{customized ? text(t.defaultValue, { value: field === "package_mode" ? messages.baseline.editing[policy.default_values.package_mode as "upgrade" | "with-new-pkgs"] : String(policy.default_values[field]) }) : custom ? t.sameDefault : t.globalDefault}</span>
            {customized ? <button type="button" disabled={busy || uncertain} onClick={() => reset(field)}>{t.useDefault}</button> : null}</div>
        </div>;
      })}</div>
      {key === "disk-local" ? <p className="tw-meta">{t.defaultFixed}</p> : null}
      <div className="tw-policy-delivery"><span className="tw-meta">{policy.latest_delivered_revision === null ? t.notDelivered : text(t.delivered, { revision: policy.latest_delivered_revision })}</span>
        <p>{t.deliveryNote}</p>{policy.latest_delivered_values ? <details><summary>{t.deliveredValues}</summary><dl>{fields(key).map((field) => <div key={field}><dt>{t.labelFields[field]}</dt><dd>{field === "package_mode" ? messages.baseline.editing[policy.latest_delivered_values!.package_mode as "upgrade" | "with-new-pkgs"] : String(policy.latest_delivered_values![field])}</dd></div>)}</dl></details> : null}</div>
      {status !== "ready" ? <p role="alert">{typeof t[status as keyof typeof t] === "string" ? t[status as keyof typeof t] as string : t.error}</p> : null}
      {["conflict", "loadFailed", "clientOutdated"].includes(status) ? <button type="button" className="tw-server-button" onClick={() => void reload()}>{t.reload}</button> : null}
      <Link href={`/settings?skill=${key}`} onClick={(e) => { if (guard.current && !window.confirm(messages.checks.discardConfirm)) e.preventDefault(); }}>{t.editDefaults}</Link>
    </div><footer><button type="button" disabled={busy || uncertain} onClick={requestClose}>{t.close}</button>
      <button type="button" className="tw-policy-save" disabled={busy || !uncertain && (!dirty || ["conflict", "loadFailed", "clientOutdated"].includes(status))} onClick={() => void save()}>{busy ? t.saving : uncertain ? t.retry : t.save}</button></footer>
  </dialog>;
}
