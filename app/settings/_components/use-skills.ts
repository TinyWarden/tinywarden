"use client";
import { useCallback, useRef, useState } from "react";
import { useOperatorRead, permissionEvent } from "@/components/operator/use-operator-read";
import { useFleetRead } from "@/components/operator/fleet-status";
import { t, validSkills, type SkillKey } from "./skill-model";
type Pending = { key: SkillKey; body: string };
export function useSkills() {
  const read = useOperatorRead("/api/v1/operator/skills", validSkills), fleet = useFleetRead();
  const reload = read.reload;
  const [pendingKey, setPendingKey] = useState<SkillKey | null>(null);
  const [saving, setSaving] = useState<SkillKey | null>(null), [notice, setNotice] = useState("");
  const pending = useRef<Pending | null>(null), busy = useRef(false);
  const toggle = async (key: SkillKey) => {
    if (busy.current || read.expired) return;
    const skill = read.value?.skills.find((s) => s.key === key);
    if (!skill || pending.current && pending.current.key !== key) return;
    if (!pending.current) pending.current = { key, body: JSON.stringify({ schema_version: 1, request_id: crypto.randomUUID(),
      expected_enablement_version: skill.enablement_version, enabled: !skill.enabled }) };
    setPendingKey(key); busy.current = true; setSaving(key); setNotice("");
    const controller = new AbortController(), timer = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`/api/v1/operator/skills/${key}/enabled`, { method: "POST", credentials: "same-origin",
        cache: "no-store", signal: controller.signal, headers: { "Content-Type": "application/json", "X-TinyWarden-Request": "1" }, body: pending.current.body });
      if (response.status === 401) { pending.current = null; setPendingKey(null); document.dispatchEvent(new Event(permissionEvent)); return; }
      if (response.status === 409) { pending.current = null; setPendingKey(null); await reload(); setNotice(t.toggleConflict); return; }
      if (!response.ok) {
        if (response.status < 500) { pending.current = null; setPendingKey(null); }
        setNotice(response.status >= 500 ? t.toggleUncertain : t.toggleFailed); return;
      }
      const v = await response.json();
      if (controller.signal.aborted || v.schema_version !== 1 || typeof v.changed !== "boolean" ||
        typeof v.enabled !== "boolean" || !Number.isSafeInteger(v.enablement_version)) { setNotice(t.toggleUncertain); return; }
      pending.current = null; setPendingKey(null);
      const [ok] = await Promise.all([reload(), fleet.reload()]);
      if (!ok) setNotice(t.refreshFailed);
    } catch { setNotice(t.toggleUncertain); }
    finally { window.clearTimeout(timer); busy.current = false; setSaving(null); }
  };
  const refresh = useCallback(async () => { if (!busy.current && !pending.current && await reload()) setNotice(""); }, [reload]);
  return { ...read, saving, notice, toggle, refresh, pendingKey,
    toggleBlocked: saving !== null || read.expired || read.failed || notice === t.refreshFailed };
}
