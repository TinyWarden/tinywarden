import { messages } from "@/i18n/messages";
import { Disclosure } from "@/components/playbook/skill";
import { DetailsGrid } from "@/components/playbook/data";
const t = messages.packageSkills;
export function PackageIdentity({ digest,source }: { digest: string;source?:string|undefined }) {
  return <div className="tw-ui tw-package-identity"><Disclosure title={t.technicalDetails}>
    <DetailsGrid facts={[
      ...(source?[{key:"source",label:messages.marketplace.source,value:source,full:true}]:[]),
      {key:"fingerprint",label:t.fingerprint,value:<><code>{digest}</code><p className="tw-t-secondary">{t.fingerprintHelp}</p></>,full:true},
    ]}/>
  </Disclosure></div>;
}
