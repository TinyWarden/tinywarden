"use client";
import { useEffect, useRef, useState } from "react";
import { messages } from "@/i18n/messages";
import { m, text } from "../operator/format";
import { WardenAvatar, wardenBody } from "./avatar";
import { visorColors, type WardenState } from "./warden-state";

export function Warden({ state }: { state: WardenState }) {
  const svg = useRef<SVGSVGElement>(null);
  const [replay, setReplay] = useState(0);
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const cells = [...element.querySelectorAll<SVGRectElement>("[data-visor-cell]")];
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    let blink: ReturnType<typeof setTimeout> | undefined;
    function draw(trail: number[], solid = false) {
      for (const [index, cell] of cells.entries()) {
        const position = trail.indexOf(index + 1);
        cell.setAttribute("opacity", String(position < 0 ? 0 : solid ? 1 : [1, .45, .18][position]));
      }
    }
    function stop() { clearInterval(timer); clearTimeout(blink); }
    function start() {
      stop(); draw([2, 3, 4], true);
      if (motion.matches || document.hidden) { element!.dataset.motion = "still"; return; }
      element!.dataset.motion = state === "healthy" ? "blink" : "sweep";
      if (state === "healthy") {
        timer = setInterval(() => { draw([]); blink = setTimeout(() => draw([2, 3, 4], true), 140); }, 3600);
      } else {
        let position = 1, direction = 1, trail = [1]; draw(trail);
        timer = setInterval(() => {
          if (position + direction > 5 || position + direction < 1) direction = -direction;
          position += direction; trail = [position, ...trail].slice(0, 3); draw(trail);
        }, 240);
      }
    }
    start(); motion.addEventListener("change", start); document.addEventListener("visibilitychange", start);
    return () => { stop(); motion.removeEventListener("change", start); document.removeEventListener("visibilitychange", start); };
  }, [state, replay]);
  const label = text(messages.brand.fleetStatus, { state: m[state] });
  return <button type="button" className="tw-warden" data-state={state}
    aria-label={text(messages.brand.replay, { status: label })} title={label}
    onClick={() => setReplay((value) => value + 1)}>
    <WardenAvatar ref={svg} aria-hidden="true" data-motion="still">
      {[1, 2, 3, 4, 5].map((column) => <rect key={column} data-visor-cell={column}
        x={4 + 8 * column} y="28" width="8" height="8" fill={visorColors[state]}
        opacity={column >= 2 && column <= 4 ? 1 : 0} />)}
    </WardenAvatar>
  </button>;
}

export function WardenFavicon({ state, count = 0 }: { state: WardenState; count?: number }) {
  useEffect(() => {
    const icon = document.createElement("link");
    icon.rel = "icon"; icon.type = "image/svg+xml";
    if (count > 0) {
      const label = count > 99 ? messages.brand.largeCount : String(count);
      const body = wardenBody.map(([x, y, width]) => `<rect x="${x}" y="${y}" width="${width}" height="8"/>`).join("");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
        <rect width="64" height="64" rx="12" fill="#100c22"/>
        <g transform="translate(3 3) scale(.8125)" shape-rendering="crispEdges">
          <g fill="#f6f4ef">${body}</g><rect x="12" y="28" width="40" height="8" fill="#100c22"/>
          <rect x="20" y="28" width="24" height="8" fill="${visorColors[state]}"/>
        </g><circle cx="43" cy="43" r="20" fill="${visorColors[state]}" stroke="#100c22" stroke-width="3"/>
        <text x="43" y="45" text-anchor="middle" dominant-baseline="middle" fill="#100c22"
          font-family="Arial, sans-serif" font-weight="700" font-size="${label.length === 1 ? 30 : label.length === 2 ? 24 : 18}">${label}</text>
        </svg>`;
      icon.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    } else icon.href = `/brand/favicon-${state}.svg`;
    icon.dataset.wardenStatus = state; icon.dataset.wardenCount = String(count);
    document.head.appendChild(icon);
    return () => { icon.remove(); };
  }, [state, count]);
  return null;
}
