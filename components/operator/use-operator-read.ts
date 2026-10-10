"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { readOperatorPages } from "./package-pages";

export const permissionEvent = "tinywarden:permission-lost";
type Timing = { as_of?: string; valid_until?: string | null; history?: unknown };
export function useOperatorRead<T extends Timing>(initialPath: string, validate: (v: unknown) => v is T, pollInterval: number | ((value:T|null)=>number) = 30000) {
  const [value, setValue] = useState<T | null>(null), [busy, setBusy] = useState(true);
  const [timing, setTiming] = useState({ received: 0, duration: 0 });
  const [dayExpired, setDayExpired] = useState(false);
  const [failed, setFailed] = useState(false), [expired, setExpired] = useState(false), [outdated, setOutdated] = useState(false);
  const state = useRef({ path: initialPath, controller: null as AbortController | null, id: 0, expired: false,
    value:null as T|null, received: 0, duration: 0, deadline: Infinity, midnight: Infinity });
  const clear = useCallback(() => {
    state.current.expired = true; state.current.id++; state.current.controller?.abort();
    setExpired(true); setValue(null); setBusy(false); setFailed(false); setOutdated(false); setDayExpired(false);
  }, []);
  const load = useCallback(async (path = state.current.path) => {
    const s = state.current;
    if (s.expired || document.hidden || s.controller) return false;
    const controller = new AbortController(), id = ++s.id, started = performance.now();
    s.controller = controller; setBusy(true);
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const next = await readOperatorPages(path, controller.signal, () => document.dispatchEvent(new Event(permissionEvent)));
      if (!validate(next)) throw new Error("operator_read_invalid");
      if (id !== s.id || controller.signal.aborted) return false;
      const now = performance.now();
      s.path = path; s.duration = now - started; s.received = now;
      s.deadline = next.as_of && next.valid_until ? now + Math.max(0, Date.parse(next.valid_until) - Date.parse(next.as_of) - s.duration) : Infinity;
      const day = next.history && typeof next.history === "object" && "next_midnight" in next.history && typeof next.history.next_midnight === "string" ? next.history.next_midnight : null;
      s.midnight = next.as_of && day ? now + Math.max(0, Date.parse(day) - Date.parse(next.as_of) - s.duration) : Infinity;
      s.value=next;setValue(next); setTiming({ received: now, duration: s.duration }); setFailed(false); setOutdated(now >= s.deadline); setDayExpired(now >= s.midnight); return true;
    } catch { if (id === s.id && !s.expired) { setFailed(true); setOutdated(true); } return false;
    } finally {
      window.clearTimeout(timeout); if (s.controller === controller) s.controller = null;
      if (id === s.id) setBusy(false);
    }
  }, [validate]);
  const reload = useCallback(() => {
    const s = state.current; s.id++; s.controller?.abort(); s.controller = null;
    return load();
  }, [load]);
  useEffect(() => {
    const s = state.current;
    const first = window.setTimeout(() => { void load(initialPath); }, 0);
    let lastPoll = performance.now();
    const interval = window.setInterval(() => {
      if (s.expired || document.hidden) return;
      const now = performance.now();
      if (now >= s.deadline) setOutdated(true);
      if (now >= s.midnight) setDayExpired(true);
      if (now - lastPoll >= (typeof pollInterval==="function"?pollInterval(s.value):pollInterval)) { lastPoll = now; void load(); }
    }, 1000);
    const visible = () => { if (!document.hidden && !s.expired) {
      if (performance.now() >= s.deadline) setOutdated(true);
      if (performance.now() >= s.midnight) setDayExpired(true);
      void load();
    } };
    document.addEventListener("visibilitychange", visible); document.addEventListener(permissionEvent, clear);
    return () => { window.clearTimeout(first); window.clearInterval(interval); document.removeEventListener("visibilitychange", visible);
      document.removeEventListener(permissionEvent, clear); s.id++; s.controller?.abort(); };
  }, [initialPath, load, clear, pollInterval]);
  return { value, receivedAt: timing.received, requestDuration: timing.duration, busy, failed, expired, outdated, dayExpired, load, reload, clear };
}
