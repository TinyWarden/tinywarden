"use client";
import {useState} from "react";
import {messages} from "@/i18n/messages";
import {ResourceSelector} from "./resource-selector";
const t=messages.resources;
export function ResourceExample({variant='normal'}:{variant?:'normal'|'partial'|'stale'|'missing'|'empty'}){
 const [selected,setSelected]=useState<string[]>(variant==='missing'?['missing.service']:[]);
 const rows=Array.from({length:14},(_,i)=>({key:`example-${i+1}.service`,label:`${t.demoName} ${i+1}`,description:t.demoDescription,state:i===1?t.demoStopped:t.demoRunning,selectable:i!==2,selectionReason:i===2?t.demoUnsupported:undefined}));
 if(variant==='missing')rows.unshift({key:'missing.service',label:'missing.service',description:t.missing,state:t.checking,selectable:false,selectionReason:t.missing});
 return <ResourceSelector label={t.example} help={t.selectionHelp} rows={variant==='empty'?[]:rows} selected={selected} onChange={setSelected} available={variant!=='empty'} fresh={variant!=='stale'} complete={variant!=='partial'}/>;
}
