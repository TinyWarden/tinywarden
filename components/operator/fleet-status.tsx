"use client";
import { createContext, useContext, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {useOperatorSession} from "./session-provider";
import { messages } from "@/i18n/messages";
import { WardenFavicon } from "../brand/warden";
import { fleetWardenState } from "../brand/warden-state";
import { m, text, type FleetView } from "./format";
import { validFleet } from "./read-validation";
import { useOperatorRead } from "./use-operator-read";

type FleetRead = ReturnType<typeof useOperatorRead<FleetView>>;
const FleetReadContext = createContext<FleetRead | null>(null);

/** One in-memory authorized reading survives operator-section navigation. */
export function FleetStatusBoundary({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return ["/dashboard", "/fleet", "/skills", "/settings", "/history", "/account"].includes(path) || path.startsWith("/skills/") || path.startsWith("/fleet/") || path.startsWith("/settings/") || path.startsWith("/account/")
    ? <FleetReadProvider>{children}</FleetReadProvider> : children;
}

function FleetReadProvider({ children }: { children: React.ReactNode }) {
  const session=useOperatorSession();
  const read = useOperatorRead("/api/v1/operator/dashboard", validFleet,30000,!!session&&!session.password_change_required);
  const retry = useRef(0);
  const {busy,expired,failed,load}=read;
  const path = usePathname();
  const count = read.value?.counts.attention ?? 0;
  const state = fleetWardenState(read.value, read.outdated || read.expired);
  const section = path.startsWith("/fleet") ? messages.fleetManagement.title : path === "/account" ? messages.account.title : path === "/account/password" ? messages.access.changePassword : path.startsWith("/settings") ? messages.agentUpdates.settings : path.startsWith("/skills") ? m.navSkills : path === "/history" ? m.navHistory : m.navDashboard;
  useEffect(() => {
    const title = text(messages.brand.tabTitle, {
      count: count > 0 ? text(messages.brand.tabCount, { count }) : "",
      brand: messages.metadata.title, section,
    });
    // Streamed route metadata can arrive after this client status effect.
    const apply = () => { if (document.title !== title) document.title = title; };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); document.title = messages.metadata.title; };
  }, [count, section]);
  useEffect(() => {
    if (busy || expired) return;
    if (!failed) { retry.current = 0; return; }
    if (retry.current || document.hidden) return;
    retry.current++;
    const timer = window.setTimeout(() => { void load(); }, 500);
    return () => { window.clearTimeout(timer); };
  }, [busy, expired, failed, load]);
  return <FleetReadContext.Provider value={read}>
    <WardenFavicon state={state} count={count} />{children}
  </FleetReadContext.Provider>;
}

export function useFleetRead() {
  const read = useContext(FleetReadContext);
  if (!read) throw new Error("missing_fleet_read_provider");
  return read;
}
