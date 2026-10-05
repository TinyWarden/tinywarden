import { messages } from "@/i18n/messages";
import type { PackageMetadata } from "@/lib/skills/package-types";
const t=messages.packageSkills;
export function PackagePermissions({metadata,open=false}:{metadata:PackageMetadata;open?:boolean}){
  const grants=metadata.manifest.capabilities;
  return <details className="tw-package-permissions" open={open}><summary>{t.permissions}</summary>
    <ul>{grants.map((grant,index)=><li key={index}><strong>{(t.permissionLabels as Record<string,string>)[String(grant.operation)]}</strong>
      <code>{JSON.stringify(Object.fromEntries(Object.entries(grant).filter(([k])=>k!=="operation")))}</code></li>)}</ul>
    {!grants.length?<p>{t.noPermissions}</p>:null}<p>{t.localLimits}</p>
  </details>;
}
