import { messages, locale } from "@/i18n/messages";
import { text } from "@/components/operator/format";
import type { MountHistory, RunHistory } from "@/server/skills/legacy/disk/health-types";
const t = messages.server, d = messages.disk;
export function usedPercent(m: MountHistory) {
  if (m.total_bytes === null || m.free_bytes === null || m.available_bytes === null) return null;
  const used = BigInt(m.total_bytes) - BigInt(m.free_bytes), available = BigInt(m.available_bytes), denominator = used + available;
  return denominator > 0n ? Number((used * 1000n + denominator / 2n) / denominator) / 10 : null;
}
export const percentLabel = (p: number) => text(t.percentFormat, { value: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(p) });
function size(v: string | null) {
  if (v === null) return t.unknownValue;
  let n = Number(v), i = 0; while (n >= 1000 && i < t.byteUnits.length - 1) { n /= 1000; i++; }
  return text(t.bytesFormat, { value: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n), unit: t.byteUnits[i]! });
}
const stateLabel = (state: string) => (d as Record<string, unknown>)[state] as string ?? d.unknown;
export function MountTable({ run, mounts = run.mounts }: { run: RunHistory; mounts?: MountHistory[] }) {
  return <div className="tw-mount-scroll"><table className="tw-mount-table"><thead><tr>{[t.mount,t.type,t.used,t.size,t.state].map((s) => <th key={s}>{s}</th>)}</tr></thead>
    <tbody>{mounts.map((m) => { const p = usedPercent(m); return <tr key={m.mount_id}>
      <th scope="row"><span className="tw-mono">{m.mount_path}</span>{m.shared_capacity ? <small>{d.shared}</small> : null}
        {m.reason !== "none" ? <small>{(d.reason as Record<string,string>)[m.reason] ?? d.unknown}</small> : null}</th>
      <td className="tw-mono">{m.filesystem_type}</td><td><div className="tw-mount-used"><span className={`tw-mount-bar tw-tone-${m.classification}`}>
        {p !== null ? <span style={{ width: `${p}%` }} /> : null}<i title={t.warningThreshold} style={{ left: `${run.warning_percent}%` }} /><i title={t.criticalThreshold} style={{ left: `${run.critical_percent}%` }} /></span>
        <strong className="tw-mono">{p === null ? t.unknownValue : percentLabel(p)}</strong></div></td>
      <td className="tw-mono">{size(m.total_bytes)}</td><td>{stateLabel(m.classification)}</td></tr>; })}</tbody></table></div>;
}
export function DiskMounts({ run }: { run: RunHistory }) {
  const writable = run.mounts.filter((m) => m.writable), readonly = run.mounts.filter((m) => !m.writable);
  return <><MountTable run={run} mounts={writable} />{readonly.length ? <details className="tw-readonly"><summary>{text(t.readOnly, { count: readonly.length })}</summary><MountTable run={run} mounts={readonly} /></details> : null}</>;
}
