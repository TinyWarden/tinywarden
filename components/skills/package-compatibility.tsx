import type {PackageMetadata} from "@/lib/skills/package-types";
import {messages} from "@/i18n/messages";
/** Render declared platforms generically; release numbers are shown only once. */
export function PackageCompatibility({metadata}:{metadata:PackageMetadata}){
  const groups=new Map<string,string[]>();
  for(const os of metadata.manifest.compatibility.os){const [family,version]=os.split(":");if(!family)continue;groups.set(family,[...(groups.get(family)??[]),...(version?[version]:[])]);}
  return <div className="tw-skill-compatibility"><span className="tw-meta">{messages.skills.compatible}</span>
    {[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([family,versions])=><div key={family}><strong>{family==="debian"?messages.skills.debian:family}</strong><span className="tw-mono">{versions.join(", ")}</span></div>)}
    <span className="tw-meta">{metadata.manifest.compatibility.architectures.join(", ")}</span>
  </div>;
}
