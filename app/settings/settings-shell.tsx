"use client";
import {PageHeader} from "@/components/playbook/page";
import type {ReactNode} from "react";
import Link from "next/link";
import {messages} from "@/i18n/messages";
import {OperatorShell} from "@/components/operator/shell";
import {settingsSections, type SettingsSection} from "./sections";

export function SettingsShell({active,children}:{active:SettingsSection;children:ReactNode}){
  return <OperatorShell active="settings"><main id="main" tabIndex={-1} className="tw-ui tw-main tw-settings-page">
    <PageHeader title={messages.agentUpdates.settings} description={messages.settingsPage.help}/>
    <div className="tw-split tw-split--master"><aside className="tw-card tw-split__rail"><nav className="tw-list" aria-label={messages.agentUpdates.settings}>
      {settingsSections.map(item=><Link key={item.key} href={item.href} className="tw-item" aria-current={active===item.key?"true":undefined}><span className="tw-item__main"><span className="tw-item__name">{item.title}</span></span></Link>)}
    </nav></aside><div className="tw-settings-content">{children}</div></div>
  </main></OperatorShell>;
}
