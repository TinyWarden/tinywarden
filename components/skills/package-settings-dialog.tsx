"use client";
import {useState} from "react";
import {messages} from "@/i18n/messages";
import {text} from "@/components/operator/format";
import {SettingsDialog} from "@/components/playbook/skill";
import {PackageEditor} from "./package-editor";
import {PackageRunNow} from "./package-run-now";
import type {PackageResults} from "./package-model";
export function PackageSettingsDialog({skill,host,hostLabel,saved,close}:{skill:PackageResults["skills"][number];host:string;hostLabel:string;saved:()=>Promise<unknown>;close:()=>void}){
  const [dirty,setDirty]=useState(false),[locked,setLocked]=useState(false);
  function requestClose(){if(!locked&&(!dirty||window.confirm(messages.packageSkills.discardConfirm)))close();}
  return <SettingsDialog title={text(messages.display.settingsTitle,{skill:skill.name})} meta={text(messages.packageSkills.serverSettingsMeta,{host:hostLabel,skill:skill.name})} help={messages.packageSkills.overrideHelp} locked={locked} close={requestClose}>
    <PackageEditor id={skill.installation_id} metadata={skill.metadata} defaults={skill.defaults} revision={skill.source_revision} policy={{host,version:skill.policy_version,overrides:skill.overrides}} saved={saved} onDirty={setDirty} onLocked={setLocked} showHelp={false} dialog
      refreshAction={skill.metadata.manifest.sdk===2?<PackageRunNow host={host} skill={skill} outdated={false} saved={saved} onSettings={()=>{}} resources hideSettings/>:undefined}
      closeAction={<a className="tw-link" href={`/skills?skill=${encodeURIComponent(skill.installation_id)}`} aria-disabled={locked} onClick={e=>{if(locked||(dirty&&!window.confirm(messages.packageSkills.discardConfirm)))e.preventDefault();}}>{messages.server.editDefaults}</a>}/>
  </SettingsDialog>;
}
