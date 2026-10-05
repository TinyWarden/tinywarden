"use client";
import { useEffect, useRef, useState } from "react";
import { messages } from "@/i18n/messages";
import { stateName } from "./skill-card";
export function JumpToSkill({ states, names = messages.skills.names }: { states: Record<string,string>; names?: Record<string,string> }) {
  const [query, setQuery] = useState(""), detail = useRef<HTMLDetailsElement>(null), input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const outside = (e: PointerEvent) => { if (e.target instanceof Node && !detail.current?.contains(e.target) && detail.current) detail.current.open = false; };
    document.addEventListener("pointerdown",outside); return () => document.removeEventListener("pointerdown",outside);
  }, []);
  const keys = Object.keys(states).filter((k) => (names[k] ?? k).toLowerCase().includes(query.trim().toLowerCase()));
  return <details ref={detail} className="tw-skill-jump" onToggle={() => { if (detail.current?.open) input.current?.focus(); }} onKeyDown={(e) => { if (e.key === "Escape" && detail.current) { detail.current.open = false; detail.current.querySelector("summary")?.focus(); } }}>
    <summary>{messages.server.jump}<span aria-hidden="true">{messages.server.arrow}</span></summary><div>
      <input ref={input} type="search" aria-label={messages.server.searchSkills} placeholder={messages.server.searchSkills} value={query} onChange={(e) => setQuery(e.target.value)} />
      {keys.map((key) => <a key={key} href={`#${key}`} onClick={() => { if (detail.current) detail.current.open = false; document.getElementById(key)?.focus(); }}><span>{names[key] ?? key}</span><span className={`tw-pill tw-tone-${states[key] ?? "unknown"}`}>{stateName(states[key] ?? "unknown")}</span></a>)}
      {!keys.length ? <p>{messages.server.noSkills}</p> : null}</div>
  </details>;
}
