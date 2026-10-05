"use client";
import { useEffect, useId, useRef, useState } from "react";
import { t } from "./skill-model";

export function SkillDescription({ children }: { children: string }) {
  const probe = useRef<HTMLParagraphElement>(null), id = useId();
  const [expanded, setExpanded] = useState(false), [clipped, setClipped] = useState(false);
  useEffect(() => {
    const node = probe.current;
    if (!node) return;
    let active = true;
    const measure = () => { if (active) setClipped(node.scrollHeight > node.clientHeight + 1); };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    void document.fonts.ready.then(measure);
    document.fonts.addEventListener("loadingdone", measure);
    return () => { active = false; observer.disconnect(); document.fonts.removeEventListener("loadingdone", measure); };
  }, [children]);
  return <div className="tw-skill-description">
    <div className="tw-skill-description-text">
      <p id={id} data-expanded={expanded}>{children}</p>
      <p ref={probe} className="tw-skill-description-probe" aria-hidden="true" data-expanded={false}>{children}</p>
    </div>
    {clipped ? <button type="button" aria-controls={id} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
      {expanded ? t.showLess : t.showMore}
    </button> : null}
  </div>;
}
