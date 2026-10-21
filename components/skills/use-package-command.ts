"use client";
import {messages} from "@/i18n/messages";
import {useOperatorCommand} from "@/components/operator/use-operator-command";
export function usePackageCommand(timeoutMs=15000){
 const command=useOperatorCommand(timeoutMs,messages.packageSkills,messages.marketplace.errors);
 const upload=(file:File,saved:()=>Promise<unknown>,uploaded?:(value:unknown)=>void)=>command.sendFile("/api/v2/operator/skills/upload",file,{"Content-Type":"application/zip","X-TinyWarden-Upload-ID":crypto.randomUUID()},saved,uploaded);
 return {...command,upload};
}
