"use client";
import {PageHeader} from "@/components/playbook/page";
import type {ReactNode} from "react";
import Link from "next/link";
import {messages} from "@/i18n/messages";
import {useOperatorSession} from "@/components/operator/session-provider";
import {OperatorShell} from "@/components/operator/shell";
import {settingsSections, type SettingsSection} from "./sections";

export function SettingsShell({active,children,dirty=false,signInMethod}:{active:SettingsSection;children:ReactNode;dirty?:boolean;signInMethod?:string}){
  const session=useOperatorSession(),method=signInMethod??(session?.sign_in?(session.sign_in.method==="oidc"?messages.oidc.provider+" · "+session.sign_in.provider_label:messages.oidc.local):null);
  return <OperatorShell active="settings"><main id="main" tabIndex={-1} className="tw-ui tw-main tw-settings-page">
    <PageHeader title={messages.agentUpdates.settings} description={messages.settingsPage.help}/>
    <div className="tw-split tw-split--master"><aside className="tw-card tw-split__rail"><nav className="tw-list" aria-label={messages.agentUpdates.settings}>
      {settingsSections.map(item=><Link key={item.key} href={item.href} className="tw-item" aria-current={active===item.key?"true":undefined}><span className="tw-item__main"><span className="tw-item__name">{item.title}</span><span className="tw-meta">{item.key==="signIn"&&method?method:item.description}</span></span>{dirty&&active===item.key?<span className="tw-tag">{messages.uiForms.unsaved}</span>:null}</Link>)}
    </nav></aside><div className="tw-settings-content">{children}</div></div>
  </main></OperatorShell>;
}
