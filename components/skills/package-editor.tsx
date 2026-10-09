"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { messages } from "@/i18n/messages";
import { packageText, type PackageMetadata, type SkillSettings, type Scalar } from "@/lib/skills/package-types";
import { matchesSchema } from "@/lib/skills/schema-values";
import { usePackageCommand } from "./use-package-command";
import {PlaybookButton} from "@/components/playbook/controls";
import {text} from "@/components/operator/format";
const t = messages.packageSkills;
export function PackageEditor({ id, metadata, defaults, revision, policy, saved, onDirty, onLocked, showHelp = true, dialog = false, closeAction }: {
  id: string; metadata: PackageMetadata; defaults: SkillSettings; revision: string;
  policy?: { host: string; version: string; overrides: SkillSettings };
  saved: () => Promise<unknown>;
  onDirty?: (dirty: boolean) => void;
  onLocked?: (locked: boolean) => void;
  showHelp?: boolean;
  dialog?: boolean;
  closeAction?: ReactNode;
}) {
  const initial = policy?.overrides ?? defaults;
  const [values, setValues] = useState<SkillSettings>(initial), [dirty, setDirty] = useState(false);
  const command = usePackageCommand();
  const base = useRef({ revision, policyVersion: policy?.version });
  useEffect(() => { onDirty?.(dirty || command.uncertain); }, [onDirty,dirty,command.uncertain]);
  useEffect(() => { onLocked?.(command.busy || command.uncertain); },[onLocked,command.busy,command.uncertain]);
  useEffect(() => {
    if (dirty) return;
    // New defaults flow into inherited fields; explicit edits retain their intent.
    const timeout = window.setTimeout(() => setValues(policy?.overrides ?? defaults), 0);
    return () => window.clearTimeout(timeout);
  }, [defaults, policy, dirty]);
  useEffect(() => {
    if (!dirty && !command.uncertain) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const leave = (event: Event) => { if(command.busy || command.uncertain || !window.confirm(t.discardConfirm))event.preventDefault(); };
    const click = (event: MouseEvent) => {
      const target=event.target instanceof Element?event.target.closest("a[href]"):null;
      if(target && target.getAttribute("href")?.startsWith("/") && !event.defaultPrevented){
        if(command.busy || command.uncertain || !window.confirm(t.discardConfirm)){event.preventDefault();event.stopPropagation();}
      }
    };
    window.addEventListener("beforeunload", warn);document.addEventListener("tinywarden:before-leave",leave);document.addEventListener("click",click,true);
    return () => {window.removeEventListener("beforeunload", warn);document.removeEventListener("tinywarden:before-leave",leave);document.removeEventListener("click",click,true);};
  }, [dirty, command.uncertain, command.busy]);
  const effective = policy ? { ...defaults, ...values } : values;
  const valid = matchesSchema(metadata.schemas.settings, effective);
  function markDirty() { if (!dirty) base.current = { revision, policyVersion: policy?.version }; setDirty(true); }
  function change(key: string, value: Scalar) { setValues((v) => ({ ...v, [key]: value })); markDirty(); }
  async function submit() {
    const endpoint = policy ? `/api/v2/operator/hosts/${policy.host}/skills/${id}` : `/api/v2/operator/skills/${id}/defaults`;
    const body = policy ? { expected_default_revision: base.current.revision, expected_policy_version: base.current.policyVersion, overrides: values }
      : { expected_revision: base.current.revision, settings: values };
    if (await command.send(endpoint, body, saved)) setDirty(false);
  }
  return <form className="tw-ui tw-package-editor" onSubmit={(e) => { e.preventDefault(); void submit(); }}><div className={dialog?"tw-dialog__body":"tw-package-editor-body"}>
    {showHelp ? <p>{policy ? t.overrideHelp : t.defaultsHelp}</p> : null}
    <div className="tw-fields">{Object.entries(metadata.manifest.fields).sort((a,b) => a[1].order - b[1].order).map(([key, field]) => {
      const schema = metadata.schemas.settings.properties![key]!, custom = Object.hasOwn(values, key), value = effective[key]!;
      const disabled = command.busy || command.uncertain || !!policy && !custom;
      const label = packageText(metadata.catalog, { key: field.label_key, params: {} });
      const unit=field.unit==="seconds"?messages.server.seconds:field.unit==="percent"?messages.server.percentUsed:field.unit;
      return <div key={key} className="tw-field tw-package-field">
        <div className="tw-field__head"><label className="tw-field__label" htmlFor={`${id}-${key}`}>{label}</label>{policy&&custom?<span className="tw-tag">{messages.server.custom}</span>:null}</div>
        <p className="tw-field__note">{packageText(metadata.catalog, { key: field.help_key, params: {} })}</p>
        {policy ? <label className="tw-check"><input type="checkbox" checked={custom} disabled={command.busy || command.uncertain} onChange={(e) => {
          setValues((v) => { const next = { ...v }; if (e.target.checked) next[key] = defaults[key]!; else delete next[key]; return next; }); markDirty();
        }} />{t.customValue}</label> : null}
        {schema.enum ? <span className="tw-select"><select id={`${id}-${key}`} value={String(value)} disabled={disabled} onChange={(e) => {
          const selected = schema.enum!.find((v) => String(v) === e.target.value)!; change(key, selected);
        }}>{schema.enum.map((v) => <option key={String(v)} value={String(v)}>{String(v)}</option>)}</select></span>
          : schema.type === "boolean" ? <label className="tw-check"><input id={`${id}-${key}`} type="checkbox" checked={value === true} disabled={disabled} onChange={(e) => change(key,e.target.checked)} />{label}</label>
          : <span className={schema.type==="string"?undefined:`tw-unit${policy?custom?" tw-unit--custom":" tw-unit--inherited":""}`}><input className={schema.type==="string"?"tw-input":undefined} id={`${id}-${key}`} type={schema.type === "string" ? "text" : "number"} value={String(value)} disabled={disabled}
            min={schema.minimum} max={schema.maximum} step={schema.type === "integer" ? 1 : "any"} maxLength={schema.maxLength}
            onChange={(e) => change(key, schema.type === "string" ? e.target.value : e.target.value === "" ? "" : Number(e.target.value))} />{unit&&schema.type!=="string"?<span className="tw-unit__suffix">{unit}</span>:null}</span>}
        {policy?<span className={`tw-field__note${custom?" tw-field__note--custom":""}`}>{text(messages.server.defaultValue,{value:String(defaults[key])+(unit?" "+unit:"")})}</span>:null}
        {command.errors.filter((error) => error.field === key).map((error,i) => <p className="tw-field__note tw-field__note--error" key={i} role="alert">{packageText(metadata.catalog,error.message)}</p>)}
      </div>;
    })}</div>
    {command.notice ? <p role="status">{command.notice}</p> : null}
    </div><div className={dialog?"tw-dialog__foot":"tw-btns tw-package-editor-actions"}>{closeAction}
    {policy ? <PlaybookButton type="button" variant="secondary" disabled={command.busy || command.uncertain} onClick={() => {setValues({});markDirty();}}>{t.reset}</PlaybookButton> : null}
    {dirty && !command.uncertain ? <PlaybookButton type="button" variant="secondary" disabled={command.busy} onClick={() => {setValues(initial);setDirty(false);base.current={revision,policyVersion:policy?.version};}}>{t.discard}</PlaybookButton> : null}
    <PlaybookButton type="submit" disabled={command.busy || !command.uncertain && (!dirty || !valid)}>{command.busy ? t.saving : command.uncertain ? t.retry : t.save}</PlaybookButton>
    </div>
  </form>;
}
