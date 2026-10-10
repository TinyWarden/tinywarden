import { messages } from "@/i18n/messages";
import type { PackageMetadata } from "@/lib/skills/package-types";
import { text } from "@/components/operator/format";
import { Disclosure } from "@/components/playbook/skill";
import { visibleGrantScopes } from "@/lib/skills/package-grants";
const t=messages.packageSkills;
function argument(slot: unknown): string {
  if (typeof slot === "string") return /^[\w./=:+-]+$/.test(slot) ? slot : JSON.stringify(slot);
  const rule = slot as { type: string; values?: string[]; minimum?: number; maximum?: number };
  return rule.values ? `[${rule.values.map(argument).join(" | ")}]` : text(t.argumentRange, { minimum: rule.minimum!, maximum: rule.maximum! });
}
function Values({ grant, field, label }: { grant: Record<string, unknown>; field: string; label: string }) {
  const values = grant[field] as string[] | undefined;
  return values?.length ? <div><dt>{label}</dt><dd><ul>{values.map((value, index) => <li key={index}><code>{value}</code></li>)}</ul></dd></div> : null;
}
export function PackagePermissions({metadata,open=false}:{metadata:PackageMetadata;open?:boolean}){
  const grants=metadata.manifest.capabilities;
  if (!visibleGrantScopes(grants)) return <p role="alert">{t.errors.package_rejected}</p>;
  return <div className="tw-ui tw-package-permissions"><Disclosure title={t.permissions} initialOpen={open}>
    <p>{t.permissionsHelp}</p><ul className="tw-permission-list">{grants.map((grant,index)=><li key={index}><strong>{(t.permissionLabels as Record<string,string>)[String(grant.operation)]}</strong>
      <p>{(t.permissionDescriptions as Record<string,string>)[String(grant.operation)]}</p><dl>
        {grant.operation === "command.capture" ? <div><dt>{t.allowedCommands}</dt><dd><ul>{(grant.argv as unknown[][]).map((args,i) =>
          <li key={i}><code>{[String(grant.executable), ...args.map(argument)].join(" ")}</code></li>)}</ul></dd></div> : null}
        <Values grant={grant} field="paths" label={t.allowedFiles} /><Values grant={grant} field="roots" label={t.allowedDirectories} />
        <Values grant={grant} field="inputs" label={t.commandInputs} /><Values grant={grant} field="helpers" label={t.commandHelpers} />
        <Values grant={grant} field="empty_directories" label={t.hiddenDirectories} /><Values grant={grant} field="units" label={t.allowedUnits} />
        <Values grant={grant} field="properties" label={t.allowedProperties} />
        {typeof grant.timeout_seconds === "number" ? <div><dt>{t.timeLimit}</dt><dd>{text(t.permissionSeconds,{count:grant.timeout_seconds})}</dd></div> : null}
        {typeof grant.max_bytes === "number" ? <div><dt>{t.readLimit}</dt><dd>{text(t.bytes,{count:grant.max_bytes})}</dd></div> : null}
        {typeof grant.max_entries === "number" ? <div><dt>{t.listLimit}</dt><dd>{text(t.entries,{count:grant.max_entries})}</dd></div> : null}
      </dl></li>)}</ul>
    {!grants.length?<p>{t.noPermissions}</p>:null}<p>{t.localLimits}</p>
  </Disclosure></div>;
}
