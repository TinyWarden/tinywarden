import { messages, locale } from "@/i18n/messages";
import { time } from "@/components/operator/format";
import { packageText, type PackageCatalog, type PackageFact, type Scalar, type FactKind } from "@/lib/skills/package-types";
function scalar(value: Scalar, kind: FactKind) {
  if (kind === "boolean") return value ? messages.packageSkills.yes : messages.packageSkills.no;
  if (kind === "time") {
    const date = typeof value === "number" && value >= 0 ? new Date(value) : null;
    return date && Number.isFinite(date.getTime()) ? time(date.toISOString(),true) : "—";
  }
  if (typeof value === "number") return new Intl.NumberFormat(locale,{ maximumFractionDigits: 2 }).format(value) + (kind === "percent" ? messages.dashboard.percent : kind === "duration" ? messages.packageSkills.seconds : "");
  return String(value);
}
export function PackageFacts({ facts, catalog }: { facts: PackageFact[]; catalog: PackageCatalog }) {
  const label = (key: string) => packageText(catalog,{ key, params: {} });
  return <div className="tw-package-facts">{facts.map((fact) => fact.kind === "table" ? <section key={fact.key}>
    <h4>{label(fact.label_key)}</h4><div className="tw-package-table"><table><thead><tr>{fact.columns.map((c) => <th key={c.key} scope="col">{label(c.label_key)}</th>)}</tr></thead>
      <tbody>{fact.rows.map((row,index) => <tr key={index}>{fact.columns.map((c) => <td key={c.key}>{scalar(row[c.key]!,c.kind)}</td>)}</tr>)}</tbody></table></div>
      {fact.truncated ? <p>{messages.packageSkills.truncated}</p> : null}
  </section> : <dl key={fact.key}><dt>{label(fact.label_key)}</dt><dd>{scalar(fact.value,fact.kind)}</dd></dl>)}</div>;
}
