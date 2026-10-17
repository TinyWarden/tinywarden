"use client";
import {useOperatorSession} from "./session-provider";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { messages } from "@/i18n/messages";
import { headerTime, headerTimeParts, m, text } from "./format";
import { permissionEvent } from "./use-operator-read";
import { BrandLogo } from "../brand/logo";
import { fleetWardenState, visorColors } from "../brand/warden-state";
import { useFleetRead } from "./fleet-status";
import {AccountMenu,type AccountMenuItem} from "../playbook/account-menu";

function Icon({ kind }: { kind: "server" | "settings" | "history" | "user" }) {
  const paths = { server: "M4 3h16v7H4zM4 14h16v7H4zM7 6.5h.01M7 17.5h.01", settings: "M4 6h9m4 0h3M4 12h3m4 0h9M4 18h11m4 0h1M13 3v6M7 9v6M15 15v6", history: "M3 12a9 9 0 1 0 3-6M3 3v6h6M12 7v5l3 2", user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2" };
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={paths[kind]} /></svg>;
}
export function OperatorShell({ active, asOf, children }: { active: "dashboard" | "skills" | "history" | "settings"; asOf?: string | undefined; children: React.ReactNode }) {
  const session=useOperatorSession(),admin=session?.role==="admin";
  const router = useRouter(), path=usePathname(), [logoutFailed, setLogoutFailed] = useState(false), [leaving, setLeaving] = useState(false);
  const accountItems:AccountMenuItem[]=[
    ...(admin?[{href:"/settings",label:messages.agentUpdates.settings,icon:"gear" as const,current:path==="/settings"||path.startsWith("/settings/")}]:[]),
    {href:"/account",label:messages.account.title,icon:"user-round",current:path==="/account"},
    ...(session?.local_password!==false?[{href:"/account/password",label:messages.access.changePassword,icon:"key-round" as const,current:path==="/account/password"}]:[])
  ];
  const read = useFleetRead(), attention = read.value?.counts.attention ?? 0;
  const state = fleetWardenState(read.value, read.outdated || read.expired);
  const badgeLabel = read.outdated ? m.outdated : text(messages.brand.fleetStatus, { state: m[state] });
  async function logout() {
    if (!document.dispatchEvent(new Event("tinywarden:before-leave", { cancelable: true }))) return;
    setLogoutFailed(false); setLeaving(true);
    try {
      const response = await fetch("/api/v1/operator/logout", { method: "POST", credentials: "same-origin", headers: {
        "Content-Type": "application/json", "X-TinyWarden-Request": "1" }, body: JSON.stringify({ schema_version: 1 }) });
      if (!response.ok && response.status !== 401) throw new Error("logout_failed");
      document.dispatchEvent(new Event(permissionEvent)); router.push("/login"); router.refresh();
    } catch { setLogoutFailed(true); } finally { setLeaving(false); }
  }
  return <div className="tw-app">
    <header className="tw-header">
      <Link href="/dashboard" className="tw-brand tw-logo-link" aria-label={messages.home.brand}><BrandLogo ground="ink" /></Link>
      <nav aria-label={messages.navigation.operator}>
        {([['dashboard', '/dashboard', m.navDashboard, 'server'], ['skills', '/skills', m.navSkills, 'settings'], ['history', '/history', m.navHistory, 'history']] as const).filter(([key])=>key!=="skills"||admin).map(([key, href, label, icon]) =>
          <Link key={key} href={href} aria-current={active === key ? "page" : undefined}><Icon kind={icon} /><span>{label}</span>
            {key === "dashboard" && attention > 0 ? <span className="tw-nav-count" data-state={state}
              style={{ backgroundColor: visorColors[state] }} title={badgeLabel}>{attention}</span> : null}</Link>)}
      </nav>
      {asOf ? <time className="tw-header-clock tw-meta" dateTime={asOf} aria-label={headerTime(asOf)}>{headerTimeParts(asOf).map((part,index)=>part.type==="literal"&&part.value===":"?<span key={index} className="tw-header-clock__separator">{part.value}</span>:part.value)}{m.separator}{m.timezoneLabel}</time> : null}
      <AccountMenu name={session?.display_name||session?.login||messages.access.account} items={accountItems} signingOut={leaving} onSignOut={()=>void logout()}/>
    </header>
    {logoutFailed ? <p role="alert" className="tw-notice">{messages.fleet.logoutFailed}</p> : null}
    {children}
  </div>;
}
export function ReadNotice({ expired, failed, outdated, loaded }: { expired: boolean; failed: boolean; outdated?: boolean; loaded: boolean }) {
  return expired ? <div role="alert" className="tw-notice"><p>{m.expired}</p><Link href="/login">{messages.fleet.signIn}</Link></div>
    : failed || outdated ? <p role="alert" className="tw-notice">{loaded ? m.outdated : messages.fleet.unavailable}</p> : null;
}
