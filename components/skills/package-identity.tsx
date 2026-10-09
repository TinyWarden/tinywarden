import { messages } from "@/i18n/messages";
import { Disclosure } from "@/components/playbook/skill";
const t = messages.packageSkills;
export function PackageIdentity({ digest }: { digest: string }) {
  return <div className="tw-ui tw-package-identity"><Disclosure title={t.technicalDetails}>
    <p>{t.fingerprintHelp}</p><span className="tw-meta">{t.fingerprint}</span><code className="tw-package-digest">{digest}</code>
  </Disclosure></div>;
}
