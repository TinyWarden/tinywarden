import { locale, messages } from "@/i18n/messages";
import type { RunHistory, MountHistory } from "@/server/skills/results/disk-health";

const t = messages.disk;
const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const numbers = new Intl.NumberFormat(locale);
function date(value: string): string { return `${dateFormat.format(new Date(value))} UTC`; }
function label(value: string): string {
  return (t.reason as Record<string, string>)[value] ?? t.unknown;
}
function percent(mount: MountHistory): string | null {
  if (mount.total_bytes === null || mount.free_bytes === null || mount.available_bytes === null) return null;
  const used = BigInt(mount.total_bytes) - BigInt(mount.free_bytes);
  const denominator = used + BigInt(mount.available_bytes);
  if (denominator === 0n) return null;
  return `${Number((1000n * used + denominator / 2n) / denominator) / 10}%`;
}
function Mounts({ mounts }: { mounts: MountHistory[] }) {
  return <ul className="mt-4 space-y-3">
    {mounts.map((mount) => <li key={mount.mount_id} className="min-w-0 rounded-lg border p-3">
      <p className="break-all font-medium">{mount.mount_path}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t.filesystem}{t.fieldSeparator}
        {mount.filesystem_type}{t.itemSeparator}{mount.writable ? t.writable : t.readOnly}
        {t.itemSeparator}{t[mount.classification as keyof typeof t] as string ?? t.unknown}</p>
      {mount.shared_capacity && <p className="text-sm text-muted-foreground">{t.shared}</p>}
      {mount.reason !== "none" && <p className="text-sm">{label(mount.reason)}</p>}
      {percent(mount) !== null && <p className="text-sm">{t.capacity}{t.fieldSeparator}{percent(mount)}
        {mount.total_bytes !== null && <>{t.itemSeparator}{t.total}{t.fieldSeparator}
          {numbers.format(BigInt(mount.total_bytes))}<span className="ms-1">{t.bytes}</span></>}</p>}
    </li>)}
  </ul>;
}
export function DiskRun({ run, open }: { run: RunHistory; open: boolean }) {
  return <details className="rounded-lg border p-4" open={open || undefined}>
    <summary className="cursor-pointer font-medium">{date(run.received_at)}{t.itemSeparator}{t.sequence}
      <span className="ms-1">{run.sequence}</span>{t.itemSeparator}
      {run.coverage === "complete" ? t.complete : t.incomplete}</summary>
    <div className="mt-3 space-y-1 text-sm text-muted-foreground">
      <p>{t.finished}{t.fieldSeparator}{date(run.finished_at)}</p>
      <p>{t.source}{t.fieldSeparator}{run.mode === "inherit" ? t.inherit : t.override}
        {t.itemSeparator}{t.definitionRevision}<span className="ms-1">{run.definition_revision}</span>
        {t.itemSeparator}{t.policyVersion}<span className="ms-1">{run.policy_version}</span></p>
      <p>{t.thresholds}{t.fieldSeparator}{run.warning_percent}{t.percentSign}
        {t.pairSeparator}{run.critical_percent}{t.percentSign}</p>
      <p>{t.coverage}{t.fieldSeparator}{label(run.reason)}</p>
      <p>{t.counts}{t.fieldSeparator}{run.excluded_kernel}{t.pairSeparator}{run.excluded_remote}</p>
      {run.dropped_runs > 0 && <p>{t.dropped}{t.fieldSeparator}{run.dropped_runs}</p>}
    </div>
    <h4 className="mt-4 font-medium">{t.mounts}</h4>
    <Mounts mounts={run.mounts} />
  </details>;
}
